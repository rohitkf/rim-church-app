/*
 * Naming a translator is a button that can be given, as naming a
 * substitute is.
 *
 * A session's translator (0315) could be named only by whoever plans the
 * running order (`svc.sessions`). Naming a substitute has been one of the
 * planner's buttons the church can give to a team or a person since 0184,
 * without giving them the plan: the person at the desk on a Sunday knows
 * who is standing in. They know who is translating too, and the Owner
 * asked for the same: "Yes like assign substitute" (November 2026).
 *
 * So there is a ninth button, `planner.translator`. Like the other eight
 * it is nobody's out of the box and anybody's to be given, by role in the
 * grid or by name or team in Settings › Page by Page › Service Planner;
 * whoever has `svc.sessions` has it already, as they have them all.
 *
 * What it lets through is the translator's rows and nothing else, until
 * the service is over: the same three rules the substitute's button has
 * (0200 split them by command so that none runs on a read), asking
 * `is_translator` where those ask `is_substitute`. A row is never both
 * (0315's check), so:
 *
 *   - a holder of this button cannot name a substitute, nor put anybody
 *     on to take the session;
 *   - a holder of the substitute's button still cannot name a translator;
 *   - neither can turn a row of one kind into the other.
 *
 * `planner_control()` (0211) already asks `may()` for any `planner.<key>`
 * it is handed, so it needs no change.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('planner.translator', 'admin', '{none,all}', 'none'),
  ('planner.translator', 'head', '{none,all}', 'none'),
  ('planner.translator', 'assistant', '{none,all}', 'none'),
  ('planner.translator', 'coordinator', '{none,all}', 'none'),
  ('planner.translator', 'member', '{none,all}', 'none'),
  ('planner.translator', 'newcomer', '{none,all}', 'none'),
  ('planner.translator', 'overwatch', '{none,all}', 'none'),
  ('planner.translator', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

drop policy if exists service_session_assignees_translator_insert on public.service_session_assignees;
create policy service_session_assignees_translator_insert on public.service_session_assignees for insert to public
  with check (is_translator and public.planner_control('translator') and not public.service_has_finished(public.session_service(session_id)));

drop policy if exists service_session_assignees_translator_update on public.service_session_assignees;
create policy service_session_assignees_translator_update on public.service_session_assignees for update to public
  using (is_translator and public.planner_control('translator') and not public.service_has_finished(public.session_service(session_id)))
  with check (is_translator and public.planner_control('translator') and not public.service_has_finished(public.session_service(session_id)));

drop policy if exists service_session_assignees_translator_delete on public.service_session_assignees;
create policy service_session_assignees_translator_delete on public.service_session_assignees for delete to public
  using (is_translator and public.planner_control('translator') and not public.service_has_finished(public.session_service(session_id)));
select public.migration_done(318, '0318_naming_a_translator_can_be_given', 'da44fca2ef644f1955a5985793acfab6a7248df21c4b6d28b7a2a0287e26a87d');
