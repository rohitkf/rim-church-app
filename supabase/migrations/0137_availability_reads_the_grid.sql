/*
 * The church sets its own permissions: Availability.
 *
 * Changing, adding or removing somebody else's answer, approving a late
 * change, and nudging whoever has not answered. Answering for yourself,
 * and asking for a late change, stay everybody's own; when answers close
 * is still Timings'.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('avail.edit_others', 'admin', '{none,all}', 'all'),
  ('avail.edit_others', 'head', '{none,team,all}', 'team'),
  ('avail.edit_others', 'coordinator', '{none}', 'none'),
  ('avail.edit_others', 'member', '{none,team,all}', 'none'),
  ('avail.edit_others', 'newcomer', '{none}', 'none'),
  ('avail.add_others', 'admin', '{none,all}', 'all'),
  ('avail.add_others', 'head', '{none,team,all}', 'none'),
  ('avail.add_others', 'coordinator', '{none}', 'none'),
  ('avail.add_others', 'member', '{none,team,all}', 'none'),
  ('avail.add_others', 'newcomer', '{none}', 'none'),
  ('avail.late_decide', 'admin', '{none,all}', 'all'),
  ('avail.late_decide', 'head', '{none,team,all}', 'team'),
  ('avail.late_decide', 'coordinator', '{none}', 'none'),
  ('avail.late_decide', 'member', '{none,team,all}', 'none'),
  ('avail.late_decide', 'newcomer', '{none}', 'none'),
  ('avail.nudge', 'admin', '{none,all}', 'all'),
  ('avail.nudge', 'head', '{none,team,all}', 'team'),
  ('avail.nudge', 'coordinator', '{none}', 'none'),
  ('avail.nudge', 'member', '{none,team,all}', 'none'),
  ('avail.nudge', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

alter policy availability_update on public.availability
  using (public.may(auth.uid(), 'avail.edit_others', department_id, service_id) or ((user_id = auth.uid()) and (not availability_is_closed(service_id))))
  with check (public.may(auth.uid(), 'avail.edit_others', department_id, service_id) or ((user_id = auth.uid()) and (not availability_is_closed(service_id))));

alter policy availability_insert on public.availability
  with check ((not service_has_finished(service_id)) and (public.may(auth.uid(), 'avail.add_others', department_id, service_id) or ((user_id = auth.uid()) and (not availability_is_closed(service_id)))));

alter policy availability_delete on public.availability
  using ((not service_has_finished(service_id)) and (public.may(auth.uid(), 'avail.add_others', department_id, service_id) or ((user_id = auth.uid()) and (not availability_is_closed(service_id)))));

alter policy availability_change_requests_decide on public.availability_change_requests
  using (public.may(auth.uid(), 'avail.late_decide', department_id, service_id))
  with check (public.may(auth.uid(), 'avail.late_decide', department_id, service_id));

alter policy availability_change_requests_select on public.availability_change_requests
  using ((user_id = auth.uid()) or public.may(auth.uid(), 'avail.late_decide', department_id, service_id) or is_service_coordinator(auth.uid(), service_id));

CREATE OR REPLACE FUNCTION public.nudge_availability(dept_id uuid, svc_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.may(auth.uid(), 'avail.nudge', dept_id, svc_id) then
    raise exception 'Nudging that team is not open to you.';
  end if;
  if public.service_has_finished(svc_id) then
    raise exception 'That service has finished — there is nothing left to answer for.';
  end if;
  return public.notify_people(
    array(select user_id from public.awaiting_availability(dept_id, svc_id)),
    'availability_reminder',
    svc_id
  );
end;
$function$;

notify pgrst, 'reload schema';
