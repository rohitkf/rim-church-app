/*
 * A locked block moves only by leave.
 *
 * Some things on a stage are not up for discussion on a Saturday night:
 * the drum shield stays where the cabling reaches, the pulpit where the
 * camera is framed. An Admin (or the Owner) can lock a block, and then
 * nobody else can move, resize, rename, recolour, re-assign or remove it.
 * Somebody who may edit and wants it elsewhere proposes a move instead —
 * where to, and a word why — and an Admin says yes or no. Yes puts the
 * block there, logged as the Admin's move; either way the asker is told.
 *
 * The lock is a fact on the block (who, when), checked by the policies
 * that already guard it, so the app cannot talk its way round it.
 */

alter table public.stage_blocks
  add column if not exists locked_by uuid references public.profiles(id) on delete set null,
  add column if not exists locked_at timestamptz;

-- The log learns the new verbs.
alter table public.stage_layout_log drop constraint if exists stage_layout_log_kind_check;
alter table public.stage_layout_log add constraint stage_layout_log_kind_check check (kind in (
  'added', 'moved', 'resized', 'rotated', 'renamed', 'recoloured', 'assigned',
  'deleted', 'commented', 'template_applied', 'cleared',
  'locked', 'unlocked', 'move_requested', 'move_approved', 'move_declined'
));

/*
 * A locked block is an Admin's to change. Everybody else's update and
 * delete stop at the lock; the lock itself is set only through
 * lock_stage_block below, so an update that tries to set or clear it by
 * hand is refused too.
 */
drop policy if exists stage_blocks_update on public.stage_blocks;
create policy stage_blocks_update on public.stage_blocks
  for update using (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'edit')
    and (locked_at is null or public.is_admin(auth.uid()))
  ) with check (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'edit')
    and (locked_at is null or public.is_admin(auth.uid()))
  );

drop policy if exists stage_blocks_delete on public.stage_blocks;
create policy stage_blocks_delete on public.stage_blocks
  for delete using (
    not public.service_has_finished(public.stage_layout_service(layout_id))
    and public.stage_may(auth.uid(), 'delete')
    and (locked_at is null or public.is_admin(auth.uid()))
  );

-- The lock columns cannot be written by a plain update, even an Admin's:
-- they go through the function, which logs the change.
create or replace function public.stage_block_lock_guard()
returns trigger
language plpgsql
as $$
begin
  if (new.locked_by is distinct from old.locked_by or new.locked_at is distinct from old.locked_at)
     and coalesce(current_setting('rim.stage_lock', true), '') <> 'on' then
    raise exception 'A lock is set with Lock, not by editing the block.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists stage_block_lock_guard on public.stage_blocks;
create trigger stage_block_lock_guard
  before update on public.stage_blocks
  for each row execute function public.stage_block_lock_guard();

revoke all on function public.stage_block_lock_guard() from public, anon, authenticated;

create or replace function public.lock_stage_block(p_block uuid, p_lock boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.stage_blocks%rowtype;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can lock or unlock a block.' using errcode = '42501';
  end if;
  select * into b from public.stage_blocks where id = p_block for update;
  if not found then
    raise exception 'That block is gone.' using errcode = '22023';
  end if;
  if public.service_has_finished(public.stage_layout_service(b.layout_id)) then
    raise exception 'That service has finished.' using errcode = '42501';
  end if;
  if p_lock = (b.locked_at is not null) then
    return;
  end if;
  perform set_config('rim.stage_lock', 'on', true);
  perform set_config('rim.stage_quiet', 'on', true);
  update public.stage_blocks
  set locked_by = case when p_lock then auth.uid() end,
      locked_at = case when p_lock then now() end
  where id = p_block;
  perform set_config('rim.stage_quiet', 'off', true);
  perform set_config('rim.stage_lock', 'off', true);
  insert into public.stage_layout_log (layout_id, block_id, block_label, kind, by)
  values (b.layout_id, b.id, b.label, case when p_lock then 'locked' else 'unlocked' end, auth.uid());
end;
$$;

revoke all on function public.lock_stage_block(uuid, boolean) from public, anon;
grant execute on function public.lock_stage_block(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Asking to move one
-- ---------------------------------------------------------------------------

create table if not exists public.stage_move_requests (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.stage_blocks(id) on delete cascade,
  layout_id uuid not null references public.stage_layouts(id) on delete cascade,
  -- Where they want it.
  x numeric not null check (x >= 0),
  y numeric not null check (y >= 0),
  w numeric not null check (w between 40 and 4000),
  h numeric not null check (h between 40 and 4000),
  note text check (note is null or char_length(note) <= 300),
  requested_by uuid references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);

comment on table public.stage_move_requests is
  'An ask to move a locked block: where to, by whom, and the Admin''s answer. Goes with the block.';

create index if not exists stage_move_requests_layout_idx on public.stage_move_requests (layout_id, status);

alter table public.stage_move_requests enable row level security;
revoke all on public.stage_move_requests from anon;
revoke insert, update, delete, truncate on public.stage_move_requests from authenticated;

-- Whoever can see the layout can see what has been asked of it: a pending
-- ask is part of the picture.
create policy stage_move_requests_select on public.stage_move_requests
  for select using ((select public.can_open_page(auth.uid(), 'stage')));

create or replace function public.request_stage_move(
  p_block uuid, p_x numeric, p_y numeric, p_w numeric, p_h numeric, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.stage_blocks%rowtype;
  req uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into b from public.stage_blocks where id = p_block;
  if not found then
    raise exception 'That block is gone.' using errcode = '22023';
  end if;
  if b.locked_at is null then
    raise exception 'That block is not locked; move it.' using errcode = '22023';
  end if;
  if public.service_has_finished(public.stage_layout_service(b.layout_id)) then
    raise exception 'That service has finished.' using errcode = '42501';
  end if;
  if not public.stage_may(auth.uid(), 'edit') then
    raise exception 'Only somebody who may edit the layout can ask to move a block.' using errcode = '42501';
  end if;
  -- One open ask per person per block; a second replaces it.
  delete from public.stage_move_requests
  where block_id = p_block and requested_by = auth.uid() and status = 'pending';

  insert into public.stage_move_requests (block_id, layout_id, x, y, w, h, note, requested_by)
  values (p_block, b.layout_id, greatest(0, p_x), greatest(0, p_y),
          least(4000, greatest(40, p_w)), least(4000, greatest(40, p_h)),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into req;

  insert into public.stage_layout_log (layout_id, block_id, block_label, kind, detail, by)
  values (b.layout_id, b.id, b.label, 'move_requested',
          jsonb_build_object('to', jsonb_build_array(p_x, p_y), 'note', nullif(btrim(coalesce(p_note, '')), '')), auth.uid());

  insert into public.notifications (user_id, type, reference_id)
  select distinct u.user_id, 'stage_move_request', req
  from (
    select r.user_id from public.user_roles r where r.role_type = 'admin'
    union select o.user_id from public.app_owner o
  ) u
  where u.user_id <> auth.uid();
  return req;
end;
$$;

revoke all on function public.request_stage_move(uuid, numeric, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.request_stage_move(uuid, numeric, numeric, numeric, numeric, text) to authenticated;

/** An Admin's answer. Yes moves the block there, as the Admin's own move. */
create or replace function public.decide_stage_move(p_request uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.stage_move_requests%rowtype;
  b public.stage_blocks%rowtype;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can answer a move request.' using errcode = '42501';
  end if;
  select * into r from public.stage_move_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'That request has already been answered.' using errcode = '22023';
  end if;
  select * into b from public.stage_blocks where id = r.block_id;
  if not found then
    raise exception 'That block is gone.' using errcode = '22023';
  end if;

  if p_approve then
    update public.stage_blocks set x = r.x, y = r.y, w = r.w, h = r.h where id = r.block_id;
  end if;
  update public.stage_move_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_by = auth.uid(), decided_at = now()
  where id = p_request;

  insert into public.stage_layout_log (layout_id, block_id, block_label, kind, detail, by)
  values (b.layout_id, b.id, b.label, case when p_approve then 'move_approved' else 'move_declined' end,
          jsonb_build_object('request', p_request, 'asked_by', r.requested_by), auth.uid());

  if r.requested_by is not null and r.requested_by <> auth.uid() then
    insert into public.notifications (user_id, type, reference_id)
    values (r.requested_by, 'stage_move_decided', p_request);
  end if;
end;
$$;

revoke all on function public.decide_stage_move(uuid, boolean) from public, anon;
grant execute on function public.decide_stage_move(uuid, boolean) to authenticated;

/** Taking your own ask back, while it is still open. */
create or replace function public.withdraw_stage_move(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.stage_move_requests
  where id = p_request and requested_by = auth.uid() and status = 'pending';
end;
$$;

revoke all on function public.withdraw_stage_move(uuid) from public, anon;
grant execute on function public.withdraw_stage_move(uuid) to authenticated;

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stage_move_requests'
     ) then
    alter publication supabase_realtime add table public.stage_move_requests;
  end if;
end $pub$;

notify pgrst, 'reload schema';
