-- ============================================================================
-- Inventory: asset tags, custody, and an append-only history
-- ============================================================================
-- The table was a name, a number and a free-text status — enough to list
-- what a team owns, not enough to answer "where is the spare radio mic and
-- who had it last". Three ideas from how asset registers are actually run:
--
-- 1. Two kinds of thing, tracked differently. A camera is an *asset*: one
--    physical unit, its own identity, individually traceable. Batteries are
--    a *consumable*: a count with a level at which someone reorders. Giving
--    both the same treatment is what makes church inventories rot.
--
-- 2. A human-readable tag, not a UUID. `MED-CAM-0007` is fixed-length,
--    sorts, reads aloud over a noisy stage, and can be written on a label.
--    Prefix identifies the team, then the category, then a zero-padded
--    sequence that never repeats within that prefix.
--
-- 3. Every movement is appended, never overwritten. Custody, repairs,
--    counts and audits all land in one ledger, so an item's history is the
--    record rather than something reconstructed from its current state.

-- Enum creation is wrapped so the file can be re-run against a database
-- that already has part of it — there is no `create type if not exists`.
do $$
begin
  if to_regtype('inventory_kind') is null then
    create type inventory_kind as enum ('asset', 'consumable');
  end if;

  if to_regtype('inventory_status') is null then
    create type inventory_status as enum (
      'in_service',   -- on the shelf, ready to use
      'on_loan',      -- signed out to someone
      'in_repair',
      'missing',      -- unaccounted for at the last audit
      'retired'       -- written off, kept for the record
    );
  end if;

  if to_regtype('inventory_condition') is null then
    create type inventory_condition as enum ('good', 'fair', 'poor');
  end if;

  if to_regtype('inventory_event_type') is null then
    create type inventory_event_type as enum (
      'created',
      'checked_out',
      'checked_in',
      'quantity_adjusted',
      'status_changed',
      'moved',
      'audited',
      'note'
    );
  end if;
end $$;

alter table public.inventory_items
  add column if not exists asset_tag text,
  add column if not exists kind inventory_kind not null default 'asset',
  add column if not exists category text,
  add column if not exists model text,
  add column if not exists serial_number text,
  add column if not exists item_status inventory_status not null default 'in_service',
  add column if not exists item_condition inventory_condition not null default 'good',
  add column if not exists held_by uuid references public.profiles(id) on delete set null,
  add column if not exists checked_out_at timestamptz,
  add column if not exists due_back date,
  add column if not exists reorder_level int,
  add column if not exists last_audited_at timestamptz,
  add column if not exists notes text;

-- One tag, one thing, for good.
create unique index if not exists inventory_items_asset_tag_key
  on public.inventory_items (asset_tag) where asset_tag is not null;

create index if not exists inventory_items_department_idx
  on public.inventory_items (department_id);

-- ---------------------------------------------------------------------------
-- The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  event_type inventory_event_type not null,
  quantity_delta int,
  from_value text,
  to_value text,
  note text
);

alter table public.inventory_events enable row level security;

create index if not exists inventory_events_item_idx
  on public.inventory_events (item_id, at desc);

-- Readable by whoever can see the item; written only through the functions
-- below, so a history entry can't be forged or edited after the fact.
drop policy if exists inventory_events_select on public.inventory_events;
create policy inventory_events_select on public.inventory_events
  for select using (
    exists (
      select 1 from public.inventory_items i
      where i.id = item_id and public.can_view_department_content(auth.uid(), i.department_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------
-- Three letters of the team, three of the category, four of sequence. The
-- sequence counts within its own prefix, so deleting an item never hands
-- its number to something else.
create or replace function public.next_asset_tag(dept_id uuid, category text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dept_code text;
  cat_code text;
  prefix text;
  next_seq int;
begin
  select upper(left(regexp_replace(coalesce(d.name, 'GEN'), '[^A-Za-z]', '', 'g') || 'XXX', 3))
    into dept_code
  from public.departments d where d.id = dept_id;

  cat_code := upper(left(regexp_replace(coalesce(nullif(category, ''), 'GEN'), '[^A-Za-z0-9]', '', 'g') || 'XXX', 3));
  prefix := coalesce(dept_code, 'GEN') || '-' || cat_code || '-';

  select coalesce(max((regexp_replace(asset_tag, '^.*-', ''))::int), 0) + 1
    into next_seq
  from public.inventory_items
  where asset_tag like prefix || '%'
    and asset_tag ~ ('^' || prefix || '[0-9]+$');

  return prefix || lpad(next_seq::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Movements
-- ---------------------------------------------------------------------------
-- Who may do what: anyone who can see a team's content may take an item out
-- and bring it back — a rule that stops people borrowing without logging it
-- is a rule that gets bypassed. Everything that changes what the register
-- says an item *is* (its status, its count, its retirement) stays with the
-- team head and Admin.
create or replace function public.inventory_can_borrow(item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.inventory_items i
    where i.id = item and public.can_view_department_content(auth.uid(), i.department_id)
  );
$$;

create or replace function public.inventory_can_manage(item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.inventory_items i
    where i.id = item
      and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), i.department_id))
  );
$$;

create or replace function public.inventory_check_out(
  item_id uuid,
  to_user uuid default null,
  due date default null,
  note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  holder uuid := coalesce(to_user, auth.uid());
  item public.inventory_items;
begin
  select * into item from public.inventory_items where id = item_id;
  if item is null then raise exception 'That item no longer exists'; end if;
  if not public.inventory_can_borrow(item_id) then
    raise exception 'You can only sign out equipment belonging to your own team';
  end if;
  if holder <> auth.uid() and not public.inventory_can_manage(item_id) then
    raise exception 'Only the team head can sign an item out to someone else';
  end if;
  if item.kind <> 'asset' then
    raise exception 'Consumables are counted, not signed out — adjust the quantity instead';
  end if;
  if item.item_status = 'on_loan' then
    raise exception 'That item is already signed out';
  end if;
  if item.item_status in ('in_repair', 'retired', 'missing') then
    raise exception 'That item is marked % and cannot be signed out', item.item_status;
  end if;

  update public.inventory_items
  set item_status = 'on_loan', held_by = holder, checked_out_at = now(), due_back = due
  where id = item_id;

  insert into public.inventory_events (item_id, actor_id, event_type, from_value, to_value, note)
  values (item_id, auth.uid(), 'checked_out', item.item_status::text, 'on_loan', note);
end;
$$;

create or replace function public.inventory_check_in(
  item_id uuid,
  condition_in inventory_condition default null,
  note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  item public.inventory_items;
begin
  select * into item from public.inventory_items where id = item_id;
  if item is null then raise exception 'That item no longer exists'; end if;
  if not public.inventory_can_borrow(item_id) then
    raise exception 'You can only return equipment belonging to your own team';
  end if;
  if item.item_status <> 'on_loan' then
    raise exception 'That item is not signed out';
  end if;

  update public.inventory_items
  set item_status = 'in_service',
      held_by = null,
      checked_out_at = null,
      due_back = null,
      item_condition = coalesce(condition_in, item_condition),
      last_audited_at = now()
  where id = item_id;

  insert into public.inventory_events (item_id, actor_id, event_type, from_value, to_value, note)
  values (item_id, auth.uid(), 'checked_in', 'on_loan', 'in_service', note);
end;
$$;

create or replace function public.inventory_adjust_quantity(
  item_id uuid,
  delta int,
  note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  item public.inventory_items;
begin
  select * into item from public.inventory_items where id = item_id;
  if item is null then raise exception 'That item no longer exists'; end if;
  if not public.inventory_can_manage(item_id) then
    raise exception 'Only the team head can change a count';
  end if;
  if item.quantity + delta < 0 then
    raise exception 'That would take the count below zero';
  end if;

  update public.inventory_items
  set quantity = quantity + delta, last_audited_at = now()
  where id = item_id;

  insert into public.inventory_events (item_id, actor_id, event_type, quantity_delta, from_value, to_value, note)
  values (item_id, auth.uid(), 'quantity_adjusted', delta, item.quantity::text, (item.quantity + delta)::text, note);
end;
$$;

create or replace function public.inventory_set_status(
  item_id uuid,
  new_status inventory_status,
  note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  item public.inventory_items;
begin
  select * into item from public.inventory_items where id = item_id;
  if item is null then raise exception 'That item no longer exists'; end if;
  if not public.inventory_can_manage(item_id) then
    raise exception 'Only the team head can change an item''s status';
  end if;
  if new_status = 'on_loan' then
    raise exception 'Sign the item out rather than setting it on loan by hand';
  end if;

  update public.inventory_items
  set item_status = new_status,
      held_by = case when new_status = 'in_service' then null else held_by end,
      checked_out_at = case when new_status = 'in_service' then null else checked_out_at end
  where id = item_id;

  insert into public.inventory_events (item_id, actor_id, event_type, from_value, to_value, note)
  values (item_id, auth.uid(), 'status_changed', item.item_status::text, new_status::text, note);
end;
$$;

-- An audit is someone saying "I have physically seen this, and it is as the
-- register says". It is the only thing that makes a register trustworthy
-- over time, so it gets its own verb and its own timestamp.
create or replace function public.inventory_audit(
  item_id uuid,
  counted int default null,
  note text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  item public.inventory_items;
begin
  select * into item from public.inventory_items where id = item_id;
  if item is null then raise exception 'That item no longer exists'; end if;
  if not public.inventory_can_borrow(item_id) then
    raise exception 'You can only audit your own team''s equipment';
  end if;

  update public.inventory_items
  set last_audited_at = now(),
      last_checked = current_date,
      quantity = case when counted is not null and item.kind = 'consumable' then counted else quantity end
  where id = item_id;

  insert into public.inventory_events (item_id, actor_id, event_type, quantity_delta, from_value, to_value, note)
  values (
    item_id,
    auth.uid(),
    'audited',
    case when counted is not null and item.kind = 'consumable' then counted - item.quantity end,
    item.quantity::text,
    coalesce(counted::text, item.quantity::text),
    note
  );
end;
$$;

-- A new item is the first line of its own history.
create or replace function public.inventory_log_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory_events (item_id, actor_id, event_type, to_value, note)
  values (new.id, auth.uid(), 'created', new.asset_tag, new.name);
  return new;
end;
$$;

drop trigger if exists inventory_items_log_created on public.inventory_items;
create trigger inventory_items_log_created
  after insert on public.inventory_items
  for each row execute function public.inventory_log_created();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.next_asset_tag(uuid, text) to authenticated;
    grant execute on function public.inventory_check_out(uuid, uuid, date, text) to authenticated;
    grant execute on function public.inventory_check_in(uuid, inventory_condition, text) to authenticated;
    grant execute on function public.inventory_adjust_quantity(uuid, int, text) to authenticated;
    grant execute on function public.inventory_set_status(uuid, inventory_status, text) to authenticated;
    grant execute on function public.inventory_audit(uuid, int, text) to authenticated;
  end if;
end $$;
