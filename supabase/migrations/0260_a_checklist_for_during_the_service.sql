/*
 * A third part to a role's checklist: during the service (asked for by the
 * Owner, November 2026).
 *
 * A role's list had two halves (0062): before the doors open and once
 * everyone has gone. What a camera operator does while the service runs —
 * start the recording at the call to worship, switch to the wide shot for
 * the sermon, stop at the blessing — had nowhere to go but the before half,
 * where it could be ticked an hour before any of it had happened.
 *
 * So a line can be 'during' as well as 'pre' or 'post':
 *
 *   - It opens when the service starts (its first session's start time)
 *     and stays open as long as the before half does, until the service
 *     has finished. A service with no session times has no start to wait
 *     for, so its during part opens with the before half, at the team's
 *     call time. The call-time gate (0079) still applies on top, as it does
 *     to every part.
 *   - An assignment says whether it carries it, as it already does for the
 *     other two (0112): include_during, on unless the Head unticks it, and
 *     never all three off. assign_to_rota gains during_service, defaulting
 *     to on, so the app already live keeps working unchanged.
 *   - The reminder and Check all know the third part. Check all also now
 *     keeps to each part's clock: it runs as the owner, so the row rules
 *     that hold the clock never applied to it, and it would tick a part
 *     that had not opened (the page hid the button, so nobody did).
 *
 * Every existing line stays where it is.
 */

alter table public.department_role_checklist_items
  drop constraint if exists department_role_checklist_items_phase_check;
alter table public.department_role_checklist_items
  add constraint department_role_checklist_items_phase_check check (phase in ('pre', 'during', 'post'));

alter table public.rota_assignments
  add column if not exists include_during boolean not null default true;
alter table public.rota_assignments
  drop constraint if exists rota_assignments_carries_a_half;
alter table public.rota_assignments
  add constraint rota_assignments_carries_a_half check (include_pre or include_during or include_post);

-- Whether an assignment carries this part of its role's checklist. The
-- two-part assignment_carries_phase (0112) stays for anything still asking
-- it; nothing in the schema does after this migration.
create or replace function public.assignment_carries_part(pre boolean, during boolean, post boolean, phase text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (phase = 'pre' and pre) or (phase = 'during' and during) or (phase = 'post' and post);
$$;

revoke all on function public.assignment_carries_part(boolean, boolean, boolean, text) from public, anon;
grant execute on function public.assignment_carries_part(boolean, boolean, boolean, text) to authenticated;

create or replace function public.awaiting_checklist(svc_id uuid, dept_id uuid default null)
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct a.user_id
  from public.rota_assignments a
  join public.department_role_checklist_items i on i.role_id = a.role_id
  left join public.rota_checklist_progress p
    on p.assignment_id = a.id and p.item_id = i.id
  where a.service_id = svc_id
    and (dept_id is null or a.department_id = dept_id)
    and public.assignment_carries_part(a.include_pre, a.include_during, a.include_post, i.phase)
    and not i.optional
    and coalesce(p.status, 'pending') = 'pending';
$function$;

-- The clock for each part (0115, 0147), with the during part added.
create or replace function public.checklist_item_writable(p_assignment uuid, p_item uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  svc uuid := public.rota_assignment_service(p_assignment);
  ended timestamptz;
  starts timestamptz;
  item_phase text;
  opens_before integer;
  stays_after integer;
begin
  select i.phase into item_phase from public.department_role_checklist_items i where i.id = p_item;
  if item_phase = 'post' then
    ended := public.service_ended_at(svc);
    if ended is null then
      return false;
    end if;
    select s.after_service_checklist_opens_minutes, s.after_service_checklist_minutes
      into opens_before, stays_after
      from public.app_settings s;
    return now() >= ended - make_interval(mins => coalesce(opens_before, 20))
       and now() <= ended + make_interval(mins => coalesce(stays_after, 120));
  end if;
  if item_phase = 'during' then
    -- Not before the service starts; a service with no times has no start
    -- to wait for (0260).
    select min(ss.start_time) into starts from public.service_sessions ss where ss.service_id = svc;
    if starts is not null and now() < starts then
      return false;
    end if;
  end if;
  return not public.service_has_finished(svc);
end;
$function$;

create or replace function public.checklist_check_all(p_assignment uuid, p_phase text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  a record;
  target public.checklist_item_status;
  target_rank int;
  item record;
  current_status public.checklist_item_status;
  ticked int := 0;
  skipped int := 0;
  stamp timestamptz := now();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_phase not in ('pre', 'during', 'post') then raise exception 'Not a part of the checklist: %', p_phase; end if;

  select ra.id, ra.role_id, ra.department_id, ra.service_id, ra.include_pre, ra.include_during, ra.include_post
    into a from public.rota_assignments ra where ra.id = p_assignment;
  if not found then raise exception 'That role is not on the rota any more.'; end if;

  if not public.may(me, 'day.check_all', a.department_id, a.service_id) then
    raise exception 'Checking a whole list at once is not open to you.' using errcode = '42501';
  end if;
  if not public.assignment_carries_part(a.include_pre, a.include_during, a.include_post, p_phase) then
    return jsonb_build_object('ticked', 0, 'skipped', 0, 'target', null);
  end if;

  target := case
    -- The Owner and Admins sign off any team's list, as the page lets them.
    when public.is_admin(me) or public.is_service_flow_signer(me, a.service_id) then 'coordinator_verified'
    when public.may(me, 'day.verify', a.department_id, a.service_id) then 'head_verified'
    else 'member_complete'
  end;
  target_rank := case target when 'coordinator_verified' then 3 when 'head_verified' then 2 else 1 end;

  perform set_config('rim.check_all', '1', true);
  for item in
    select i.id, i.optional from public.department_role_checklist_items i
    where i.role_id = a.role_id and i.phase = p_phase
    order by i.sort_order
  loop
    current_status := null;
    select p.status into current_status from public.rota_checklist_progress p
    where p.assignment_id = a.id and p.item_id = item.id;
    -- An optional line nobody has taken on is the assignee's to take (0259).
    if item.optional and coalesce(current_status, 'pending') = 'pending' then
      continue;
    end if;
    -- Not open by the clock: the part's own window, and the call time for
    -- anybody but an Admin — what the row rules ask (0136, 0200). Running as
    -- the owner, this function is not held to them, so it asks for itself;
    -- before 0260 it ticked a part that had not opened yet.
    if not public.checklist_item_writable(a.id, item.id)
       or (not public.is_admin(me) and not public.assignment_checklist_is_open(a.id)) then
      skipped := skipped + 1;
      continue;
    end if;
    if (case coalesce(current_status, 'pending') when 'coordinator_verified' then 3 when 'head_verified' then 2 when 'member_complete' then 1 else 0 end) >= target_rank then
      continue;
    end if;
    begin
      insert into public.rota_checklist_progress as p (
        assignment_id, item_id, status, completed_by, completed_at,
        verified_by_head, verified_by_head_at, verified_by_coordinator, verified_by_coordinator_at
      ) values (
        a.id, item.id, target, me, stamp,
        case when target_rank >= 2 then me end, case when target_rank >= 2 then stamp end,
        case when target_rank >= 3 then me end, case when target_rank >= 3 then stamp end
      )
      on conflict (assignment_id, item_id) do update set
        status = excluded.status,
        completed_by = coalesce(p.completed_by, excluded.completed_by),
        completed_at = coalesce(p.completed_at, excluded.completed_at),
        verified_by_head = coalesce(p.verified_by_head, excluded.verified_by_head),
        verified_by_head_at = coalesce(p.verified_by_head_at, excluded.verified_by_head_at),
        verified_by_coordinator = coalesce(p.verified_by_coordinator, excluded.verified_by_coordinator),
        verified_by_coordinator_at = coalesce(p.verified_by_coordinator_at, excluded.verified_by_coordinator_at);
      ticked := ticked + 1;
    exception when others then
      -- Its part is not open yet, or the service is past: leave it.
      skipped := skipped + 1;
    end;
  end loop;
  perform set_config('rim.check_all', '', true);

  return jsonb_build_object('ticked', ticked, 'skipped', skipped, 'target', target);
end;
$$;

revoke all on function public.checklist_check_all(uuid, text) from public, anon;
grant execute on function public.checklist_check_all(uuid, text) to authenticated;

-- One assign_to_rota for the API to resolve: the eight-argument form goes,
-- and the new one answers the same named call the live app makes, since
-- the new choice defaults to on.
drop function if exists public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[], boolean, boolean);

create or replace function public.assign_to_rota(
  service uuid,
  department uuid,
  person uuid,
  role_label text,
  role uuid default null,
  tags uuid[] default '{}',
  before_service boolean default true,
  after_service boolean default true,
  during_service boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  made uuid;
begin
  insert into public.rota_assignments
    (service_id, department_id, user_id, role_label, role_id, include_pre, include_during, include_post)
  values (service, department, person, role_label, role, before_service, during_service, after_service)
  returning id into made;

  insert into public.rota_assignment_tags (assignment_id, tag_id)
  select made, t from unnest(coalesce(tags, '{}')) as t
  on conflict do nothing;

  return made;
end;
$$;

revoke all on function public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[], boolean, boolean, boolean) from public, anon;
grant execute on function public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[], boolean, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
