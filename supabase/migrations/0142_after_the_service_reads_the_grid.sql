/*
 * The church sets its own permissions: After the service.
 *
 * A team's debrief: writing it, ticking its points and changing any of
 * them; and adding to it in the window after the service. The window is
 * still Timings'.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('debrief.manage', 'admin', '{none,all}', 'all'),
  ('debrief.manage', 'head', '{none,team,all}', 'team'),
  ('debrief.manage', 'coordinator', '{none}', 'none'),
  ('debrief.manage', 'member', '{none,team,all}', 'none'),
  ('debrief.manage', 'newcomer', '{none}', 'none'),
  ('debrief.contribute', 'admin', '{none,all}', 'none'),
  ('debrief.contribute', 'head', '{none,team,all}', 'none'),
  ('debrief.contribute', 'coordinator', '{none,team}', 'none'),
  ('debrief.contribute', 'member', '{none,team,all}', 'team'),
  ('debrief.contribute', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

CREATE OR REPLACE FUNCTION public.may_write_debrief(debrief uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.service_debriefs d
    where d.id = debrief
      and public.may(auth.uid(), 'debrief.manage', d.department_id, d.service_id)
  );
$function$;

CREATE OR REPLACE FUNCTION public.member_may_write_debrief(debrief uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.service_debriefs d
    where d.id = debrief
      and public.may(auth.uid(), 'debrief.contribute', d.department_id, d.service_id)
      and public.debrief_window_open(d.service_id)
  );
$function$;

alter policy service_debriefs_insert on public.service_debriefs
  with check ((written_by = auth.uid()) and public.may(auth.uid(), 'debrief.manage', department_id, service_id));

alter policy service_debriefs_insert_member on public.service_debriefs
  with check ((written_by = auth.uid()) and public.may(auth.uid(), 'debrief.contribute', department_id, service_id) and debrief_window_open(service_id));

alter policy service_debriefs_update on public.service_debriefs
  using (public.may(auth.uid(), 'debrief.manage', department_id, service_id))
  with check (public.may(auth.uid(), 'debrief.manage', department_id, service_id));

alter policy service_debriefs_delete on public.service_debriefs
  using (public.may(auth.uid(), 'debrief.manage', department_id, service_id));

notify pgrst, 'reload schema';
