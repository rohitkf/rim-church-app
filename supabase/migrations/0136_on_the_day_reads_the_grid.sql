/*
 * The church sets its own permissions: On the day.
 *
 * Ticking somebody else's checklist (verifying it), the team's green
 * light, attendance, and nudging whoever has not finished. Your own ticks
 * stay yours, the Sign-off team still signs every team off, and the
 * checklist's window still opens and closes as Timings say — an Admin's
 * standing exception to the window is kept, for an Admin the grid allows.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('day.verify', 'admin', '{none,all}', 'all'),
  ('day.verify', 'head', '{none,team,all}', 'team'),
  ('day.verify', 'coordinator', '{none,team}', 'team'),
  ('day.verify', 'member', '{none,team,all}', 'none'),
  ('day.verify', 'newcomer', '{none}', 'none'),
  ('day.ready', 'admin', '{none,all}', 'all'),
  ('day.ready', 'head', '{none,team,all}', 'team'),
  ('day.ready', 'coordinator', '{none,team}', 'team'),
  ('day.ready', 'member', '{none,team,all}', 'none'),
  ('day.ready', 'newcomer', '{none}', 'none'),
  ('day.attendance', 'admin', '{none,all}', 'all'),
  ('day.attendance', 'head', '{none,team,all}', 'team'),
  ('day.attendance', 'coordinator', '{none}', 'none'),
  ('day.attendance', 'member', '{none,team,all}', 'none'),
  ('day.attendance', 'newcomer', '{none}', 'none'),
  ('day.nudge', 'admin', '{none,all}', 'all'),
  ('day.nudge', 'head', '{none,team,all}', 'team'),
  ('day.nudge', 'coordinator', '{none,team}', 'none'),
  ('day.nudge', 'member', '{none,team,all}', 'none'),
  ('day.nudge', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

alter policy rota_checklist_progress_write on public.rota_checklist_progress
  using (checklist_item_writable(assignment_id, item_id) and ((public.is_admin(auth.uid()) and public.may(auth.uid(), 'day.verify', public.rota_assignment_department(assignment_id), public.rota_assignment_service(assignment_id))) or (assignment_checklist_is_open(assignment_id) and ((auth.uid() = rota_assignment_user(assignment_id)) or public.may(auth.uid(), 'day.verify', public.rota_assignment_department(assignment_id), public.rota_assignment_service(assignment_id)) or is_service_flow_signer(auth.uid(), rota_assignment_service(assignment_id))))))
  with check (checklist_item_writable(assignment_id, item_id) and ((public.is_admin(auth.uid()) and public.may(auth.uid(), 'day.verify', public.rota_assignment_department(assignment_id), public.rota_assignment_service(assignment_id))) or (assignment_checklist_is_open(assignment_id) and ((auth.uid() = rota_assignment_user(assignment_id)) or public.may(auth.uid(), 'day.verify', public.rota_assignment_department(assignment_id), public.rota_assignment_service(assignment_id)) or is_service_flow_signer(auth.uid(), rota_assignment_service(assignment_id))))));

CREATE OR REPLACE FUNCTION public.may_mark_team_ready(uid uuid, svc uuid, dept uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select uid is not null and (
    public.may(uid, 'day.ready', dept, svc)
  );
$function$;

alter policy attendance_write on public.attendance
  using (public.may(auth.uid(), 'day.attendance', department_id, service_id))
  with check (public.may(auth.uid(), 'day.attendance', department_id, service_id));

CREATE OR REPLACE FUNCTION public.nudge_checklist(svc_id uuid, dept_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if dept_id is null then
    if not public.may(auth.uid(), 'day.nudge', null, svc_id) then
      raise exception 'Nudging every team at once is not open to you.';
    end if;
  elsif not public.may(auth.uid(), 'day.nudge', dept_id, svc_id) then
    raise exception 'Nudging that team is not open to you.';
  end if;
  if public.service_has_finished(svc_id) then
    raise exception 'That service has finished — its checklists are closed.';
  end if;
  return public.notify_people(
    array(select user_id from public.awaiting_checklist(svc_id, dept_id)),
    'checklist_reminder',
    svc_id
  );
end;
$function$;

notify pgrst, 'reload schema';
