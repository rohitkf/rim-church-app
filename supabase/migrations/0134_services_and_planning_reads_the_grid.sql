/*
 * The church sets its own permissions: Services & planning.
 *
 * Services, their templates and run sheets, guests, repeats, the church
 * diary and each team's call time. A finished service stays a record
 * whatever the grid says: `service_has_finished` still guards its sessions.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('svc.manage', 'admin', '{none,all}', 'all'),
  ('svc.manage', 'head', '{none,all}', 'none'),
  ('svc.manage', 'coordinator', '{none}', 'none'),
  ('svc.manage', 'member', '{none,all}', 'none'),
  ('svc.manage', 'newcomer', '{none}', 'none'),
  ('svc.templates', 'admin', '{none,all}', 'all'),
  ('svc.templates', 'head', '{none,all}', 'none'),
  ('svc.templates', 'coordinator', '{none}', 'none'),
  ('svc.templates', 'member', '{none,all}', 'none'),
  ('svc.templates', 'newcomer', '{none}', 'none'),
  ('svc.sessions', 'admin', '{none,all}', 'all'),
  ('svc.sessions', 'head', '{none,all}', 'none'),
  ('svc.sessions', 'coordinator', '{none}', 'none'),
  ('svc.sessions', 'member', '{none,all}', 'none'),
  ('svc.sessions', 'newcomer', '{none}', 'none'),
  ('svc.guests', 'admin', '{none,all}', 'all'),
  ('svc.guests', 'head', '{none,all}', 'none'),
  ('svc.guests', 'coordinator', '{none}', 'none'),
  ('svc.guests', 'member', '{none,all}', 'none'),
  ('svc.guests', 'newcomer', '{none}', 'none'),
  ('svc.repeat', 'admin', '{none,all}', 'all'),
  ('svc.repeat', 'head', '{none,all}', 'none'),
  ('svc.repeat', 'coordinator', '{none}', 'none'),
  ('svc.repeat', 'member', '{none,all}', 'none'),
  ('svc.repeat', 'newcomer', '{none}', 'none'),
  ('svc.events', 'admin', '{none,all}', 'all'),
  ('svc.events', 'head', '{none,team,all}', 'team'),
  ('svc.events', 'coordinator', '{none}', 'none'),
  ('svc.events', 'member', '{none,team,all}', 'none'),
  ('svc.events', 'newcomer', '{none}', 'none'),
  ('svc.call_times', 'admin', '{none,all}', 'all'),
  ('svc.call_times', 'head', '{none,team,all}', 'team'),
  ('svc.call_times', 'coordinator', '{none}', 'none'),
  ('svc.call_times', 'member', '{none,team,all}', 'none'),
  ('svc.call_times', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

alter policy services_write on public.services
  using (public.may(auth.uid(), 'svc.manage'))
  with check (public.may(auth.uid(), 'svc.manage'));

alter policy service_templates_admin_write on public.service_templates
  using (public.may(auth.uid(), 'svc.templates'))
  with check (public.may(auth.uid(), 'svc.templates'));

alter policy service_template_sessions_admin_write on public.service_template_sessions
  using (public.may(auth.uid(), 'svc.templates'))
  with check (public.may(auth.uid(), 'svc.templates'));

alter policy service_sessions_write on public.service_sessions
  using (public.may(auth.uid(), 'svc.sessions', null, service_id) and not public.service_has_finished(service_id))
  with check (public.may(auth.uid(), 'svc.sessions', null, service_id) and not public.service_has_finished(service_id));

alter policy service_session_assignees_write on public.service_session_assignees
  using (public.may(auth.uid(), 'svc.sessions', null, public.session_service(session_id)) and not public.service_has_finished(public.session_service(session_id)))
  with check (public.may(auth.uid(), 'svc.sessions', null, public.session_service(session_id)) and not public.service_has_finished(public.session_service(session_id)));

alter policy guests_write on public.guests
  using (public.may(auth.uid(), 'svc.guests'))
  with check (public.may(auth.uid(), 'svc.guests'));

alter policy service_series_write on public.service_series
  using (public.may(auth.uid(), 'svc.repeat'))
  with check (public.may(auth.uid(), 'svc.repeat'));

CREATE OR REPLACE FUNCTION public.create_service_series(first_date date, service_name text, how_often text, template uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  series uuid;
  first_service uuid;
begin
  if not public.may(auth.uid(), 'svc.repeat') then
    raise exception 'Setting services to repeat is not open to you.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.services where date = first_date and service_type = btrim(service_name)
  ) then
    raise exception 'There is already a % on that date.', btrim(service_name) using errcode = '23505';
  end if;

  insert into public.service_series
    (service_type, template_id, frequency, anchor_date, generated_through, created_by)
  values
    (btrim(service_name), template, how_often, first_date, first_date - 1, auth.uid())
  returning id into series;

  perform public.extend_service_series(series);

  select id into first_service
  from public.services
  where series_id = series and date = first_date;
  return first_service;
end;
$function$;

-- A church-wide event belongs to no team, so only "Everywhere" reaches it.

alter policy church_events_insert on public.church_events
  with check ((created_by = auth.uid()) and public.may(auth.uid(), 'svc.events', department_id));

alter policy church_events_update on public.church_events
  using (public.may(auth.uid(), 'svc.events', department_id))
  with check (public.may(auth.uid(), 'svc.events', department_id));

alter policy church_events_delete on public.church_events
  using (public.may(auth.uid(), 'svc.events', department_id));

alter policy department_call_times_write on public.department_call_times
  using (public.may(auth.uid(), 'svc.call_times', department_id))
  with check (public.may(auth.uid(), 'svc.call_times', department_id));

notify pgrst, 'reload schema';
