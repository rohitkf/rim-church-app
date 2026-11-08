/*
 * A checklist line can be optional (asked for by the Owner, November 2026).
 *
 * Some jobs on a role's list are worth writing down but are not owed every
 * Sunday — "Charge the spare gimbal", "Film a short clip for socials". Kept
 * as ordinary lines they held a team's readiness below 100% on a morning
 * when everything that mattered was done, and drew a reminder for work
 * nobody had asked for.
 *
 * So a line can be marked optional (the Head, under Teams, by the same
 * team.checklists cell that writes the list). An optional line does not
 * count until the person holding the role ticks it: from that tick it is an
 * ordinary item, verified and signed off like the rest, and it counts in
 * that team's readiness and the service's. Taken back to pending, it drops
 * out again. The app does the counting (lib/readiness.ts); here:
 *
 *   - awaiting_checklist (who "Remind whoever hasn't finished" reaches)
 *     no longer waits on an optional line nobody has taken on;
 *   - checklist_check_all leaves an untaken optional line alone. Taking
 *     one on is the assignee's choice, not the Owner's in one press; a line
 *     already taken on is carried forward with the rest.
 *
 * Every existing line stays required.
 */

alter table public.department_role_checklist_items
  add column if not exists optional boolean not null default false;

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
    and public.assignment_carries_phase(a.include_pre, a.include_post, i.phase)
    and not i.optional
    and coalesce(p.status, 'pending') = 'pending';
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
  if p_phase not in ('pre', 'post') then raise exception 'Not a half of the checklist: %', p_phase; end if;

  select ra.id, ra.role_id, ra.department_id, ra.service_id, ra.include_pre, ra.include_post
    into a from public.rota_assignments ra where ra.id = p_assignment;
  if not found then raise exception 'That role is not on the rota any more.'; end if;

  if not public.may(me, 'day.check_all', a.department_id, a.service_id) then
    raise exception 'Checking a whole list at once is not open to you.' using errcode = '42501';
  end if;
  if (p_phase = 'pre' and a.include_pre is false) or (p_phase = 'post' and a.include_post is false) then
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
      -- Its half is not open yet, or the service is past: leave it.
      skipped := skipped + 1;
    end;
  end loop;
  perform set_config('rim.check_all', '', true);

  return jsonb_build_object('ticked', ticked, 'skipped', skipped, 'target', target);
end;
$$;

revoke all on function public.checklist_check_all(uuid, text) from public, anon;
grant execute on function public.checklist_check_all(uuid, text) to authenticated;

notify pgrst, 'reload schema';
