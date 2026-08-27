-- ============================================================================
-- Inventory: what it is worth, and who may change it
-- ============================================================================
-- Two changes.
--
-- 1. Estimated cost, so a team (and the church) can say what its equipment
--    is worth — for an insurance schedule, a replacement plan, or a budget
--    conversation. Consumables are worth cost x quantity; an asset is worth
--    its own cost. Only kit that is in service counts toward a total:
--    something retired, missing or on the repair bench is not value you can
--    rely on, and quietly counting it makes the number a comfort rather
--    than a fact.
--
-- 2. Changing the register — signing kit out, recording a count, marking a
--    repair — becomes the team head's and Admin's, matching who may already
--    add and delete items. Everyone else on the team keeps full sight of it
--    and can change nothing.
alter table public.inventory_items
  add column if not exists estimated_cost numeric(12, 2);

comment on column public.inventory_items.estimated_cost is
  'Replacement value of one unit, in the church''s currency. Totals count only items in service.';

-- Previously "anyone who can see this team's content". The register is now
-- read-only for everyone but the head.
create or replace function public.inventory_can_borrow(item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.inventory_can_manage(item);
$$;

-- The refusals in the movement functions still said "belonging to your own
-- team", which now misleads: a team member is on the team and still may not
-- do this. Re-stated so the message names the actual rule.
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
  if not public.inventory_can_manage(item_id) then
    raise exception 'Only the team head can sign equipment out';
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
  if not public.inventory_can_manage(item_id) then
    raise exception 'Only the team head can book equipment back in';
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
  if not public.inventory_can_manage(item_id) then
    raise exception 'Only the team head can record a stock check';
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
