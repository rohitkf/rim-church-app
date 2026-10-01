/*
 * "Ready for service" opens at the team's call time.
 *
 * A team's light could be turned green days before the service, which
 * says nothing about whether the team is ready — nobody is in the building
 * yet. It now opens when the checklist does: at that team's call time on
 * the day of the service (call_time_for, seven o'clock when none is set;
 * checklist_is_open, 0079). An Admin is not held to it, the same as with
 * the checklist, so a light set wrongly can still be put right.
 *
 * Only set_team_ready changes, and it keeps its signature.
 */

create or replace function public.set_team_ready(service uuid, department uuid, is_ready boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.may_mark_team_ready(auth.uid(), service, department) then
    raise exception 'Only the team’s Coordinator, its Head or an Admin can say whether it is ready.'
      using errcode = '42501';
  end if;
  if public.service_has_finished(service) then
    raise exception 'That service has finished — its lights are a record now.'
      using errcode = 'P0001';
  end if;
  if not public.is_admin(auth.uid()) and not public.checklist_is_open(department, service) then
    raise exception 'A team can say it is ready from its call time on the day of the service (% church time).',
      to_char(public.checklist_opens_at(department, service) at time zone public.church_timezone(), 'HH24:MI')
      using errcode = '42501';
  end if;

  insert into public.service_team_readiness (service_id, department_id, ready, marked_by, marked_at)
  values (service, department, is_ready, auth.uid(), now())
  on conflict (service_id, department_id) do update
    set ready = excluded.ready,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at;
end;
$$;

revoke all on function public.set_team_ready(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_team_ready(uuid, uuid, boolean) to authenticated;
