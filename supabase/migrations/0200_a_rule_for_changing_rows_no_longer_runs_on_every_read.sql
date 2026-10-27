/*
 * A rule for changing rows no longer runs on every read.
 *
 * A policy written `for all` covers select as well as insert, update and
 * delete. On these 32 tables each one sat beside the table's own read
 * policy, and Postgres joins every permissive policy for a command with
 * an OR, evaluating the write rule's half first. So reading
 * service_sessions, whose read rule is only "signed in", also asked
 * may(..., 'svc.sessions', ...) and service_has_finished() of every row:
 * 106 ms to read 145 rows as an ordinary team member, against 0.34 ms
 * with the read rule alone. Realtime pays the same price for each person
 * watching a table, on every change to it.
 *
 * Each `for all` policy becomes three — insert, update, delete — with the
 * same expressions, so who may change what is exactly as before. Reading
 * is now the read policy's alone.
 *
 * Dry-run on production before applying, as all 44 people and as nobody
 * signed in, counting every row each could read on each of the 32 tables
 * (1,440 checks): every signed-in person reads exactly the rows they read
 * before. A request with nobody signed in used to be refused on 13 of the
 * tables, because the write rule's may() is not theirs to call; it now
 * reads nothing instead.
 *
 * clock_in_place_admin stays `for all`: it is that table's only policy,
 * so it is also its read rule.
 *
 * From here on a write policy names its commands (AGENTS.md §6).
 */

-- attendance
drop policy if exists attendance_write on public.attendance;
create policy attendance_write_insert on public.attendance for insert to public
  with check (may(auth.uid(), 'day.attendance'::text, department_id, service_id));
create policy attendance_write_update on public.attendance for update to public
  using (may(auth.uid(), 'day.attendance'::text, department_id, service_id))
  with check (may(auth.uid(), 'day.attendance'::text, department_id, service_id));
create policy attendance_write_delete on public.attendance for delete to public
  using (may(auth.uid(), 'day.attendance'::text, department_id, service_id));

-- checklists
drop policy if exists checklists_write on public.checklists;
create policy checklists_write_insert on public.checklists for insert to public
  with check ((is_admin(auth.uid()) OR is_dept_head(auth.uid(), department_id)));
create policy checklists_write_update on public.checklists for update to public
  using ((is_admin(auth.uid()) OR is_dept_head(auth.uid(), department_id)))
  with check ((is_admin(auth.uid()) OR is_dept_head(auth.uid(), department_id)));
create policy checklists_write_delete on public.checklists for delete to public
  using ((is_admin(auth.uid()) OR is_dept_head(auth.uid(), department_id)));

-- department_call_times
drop policy if exists department_call_times_write on public.department_call_times;
create policy department_call_times_write_insert on public.department_call_times for insert to public
  with check (may(auth.uid(), 'svc.call_times'::text, department_id));
create policy department_call_times_write_update on public.department_call_times for update to public
  using (may(auth.uid(), 'svc.call_times'::text, department_id))
  with check (may(auth.uid(), 'svc.call_times'::text, department_id));
create policy department_call_times_write_delete on public.department_call_times for delete to public
  using (may(auth.uid(), 'svc.call_times'::text, department_id));

-- department_guests
drop policy if exists department_guests_write on public.department_guests;
create policy department_guests_write_insert on public.department_guests for insert to public
  with check (may(auth.uid(), 'team.members'::text, department_id));
create policy department_guests_write_update on public.department_guests for update to public
  using (may(auth.uid(), 'team.members'::text, department_id))
  with check (may(auth.uid(), 'team.members'::text, department_id));
create policy department_guests_write_delete on public.department_guests for delete to public
  using (may(auth.uid(), 'team.members'::text, department_id));

-- department_members
drop policy if exists department_members_write on public.department_members;
create policy department_members_write_insert on public.department_members for insert to public
  with check (may(auth.uid(), 'team.members'::text, department_id));
create policy department_members_write_update on public.department_members for update to public
  using (may(auth.uid(), 'team.members'::text, department_id))
  with check (may(auth.uid(), 'team.members'::text, department_id));
create policy department_members_write_delete on public.department_members for delete to public
  using (may(auth.uid(), 'team.members'::text, department_id));

-- department_role_checklist_items
drop policy if exists department_role_checklist_items_write on public.department_role_checklist_items;
create policy department_role_checklist_items_write_insert on public.department_role_checklist_items for insert to public
  with check (may(auth.uid(), 'team.checklists'::text, department_id));
create policy department_role_checklist_items_write_update on public.department_role_checklist_items for update to public
  using (may(auth.uid(), 'team.checklists'::text, department_id))
  with check (may(auth.uid(), 'team.checklists'::text, department_id));
create policy department_role_checklist_items_write_delete on public.department_role_checklist_items for delete to public
  using (may(auth.uid(), 'team.checklists'::text, department_id));

-- department_role_groups
drop policy if exists department_role_groups_write on public.department_role_groups;
create policy department_role_groups_write_insert on public.department_role_groups for insert to public
  with check (may(auth.uid(), 'team.groups'::text, department_id));
create policy department_role_groups_write_update on public.department_role_groups for update to public
  using (may(auth.uid(), 'team.groups'::text, department_id))
  with check (may(auth.uid(), 'team.groups'::text, department_id));
create policy department_role_groups_write_delete on public.department_role_groups for delete to public
  using (may(auth.uid(), 'team.groups'::text, department_id));

-- department_roles
drop policy if exists department_roles_write on public.department_roles;
create policy department_roles_write_insert on public.department_roles for insert to public
  with check (may(auth.uid(), 'team.roles'::text, department_id));
create policy department_roles_write_update on public.department_roles for update to public
  using (may(auth.uid(), 'team.roles'::text, department_id))
  with check (may(auth.uid(), 'team.roles'::text, department_id));
create policy department_roles_write_delete on public.department_roles for delete to public
  using (may(auth.uid(), 'team.roles'::text, department_id));

-- giving_bank_accounts
drop policy if exists giving_bank_accounts_write on public.giving_bank_accounts;
create policy giving_bank_accounts_write_insert on public.giving_bank_accounts for insert to public
  with check (may(auth.uid(), 'give.edit'::text));
create policy giving_bank_accounts_write_update on public.giving_bank_accounts for update to public
  using (may(auth.uid(), 'give.edit'::text))
  with check (may(auth.uid(), 'give.edit'::text));
create policy giving_bank_accounts_write_delete on public.giving_bank_accounts for delete to public
  using (may(auth.uid(), 'give.edit'::text));

-- giving_links
drop policy if exists giving_links_write on public.giving_links;
create policy giving_links_write_insert on public.giving_links for insert to public
  with check (may(auth.uid(), 'give.edit'::text));
create policy giving_links_write_update on public.giving_links for update to public
  using (may(auth.uid(), 'give.edit'::text))
  with check (may(auth.uid(), 'give.edit'::text));
create policy giving_links_write_delete on public.giving_links for delete to public
  using (may(auth.uid(), 'give.edit'::text));

-- giving_page
drop policy if exists giving_page_write on public.giving_page;
create policy giving_page_write_insert on public.giving_page for insert to public
  with check (may(auth.uid(), 'give.edit'::text));
create policy giving_page_write_update on public.giving_page for update to public
  using (may(auth.uid(), 'give.edit'::text))
  with check (may(auth.uid(), 'give.edit'::text));
create policy giving_page_write_delete on public.giving_page for delete to public
  using (may(auth.uid(), 'give.edit'::text));

-- guest_rota_assignments
drop policy if exists guest_rota_assignments_write on public.guest_rota_assignments;
create policy guest_rota_assignments_write_insert on public.guest_rota_assignments for insert to public
  with check (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id) AND (EXISTS ( SELECT 1
   FROM department_guests dg
  WHERE ((dg.guest_id = guest_rota_assignments.guest_id) AND (dg.department_id = guest_rota_assignments.department_id))))));
create policy guest_rota_assignments_write_update on public.guest_rota_assignments for update to public
  using (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id)))
  with check (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id) AND (EXISTS ( SELECT 1
   FROM department_guests dg
  WHERE ((dg.guest_id = guest_rota_assignments.guest_id) AND (dg.department_id = guest_rota_assignments.department_id))))));
create policy guest_rota_assignments_write_delete on public.guest_rota_assignments for delete to public
  using (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id)));

-- guests
drop policy if exists guests_write on public.guests;
create policy guests_write_insert on public.guests for insert to public
  with check (may(auth.uid(), 'svc.guests'::text));
create policy guests_write_update on public.guests for update to public
  using (may(auth.uid(), 'svc.guests'::text))
  with check (may(auth.uid(), 'svc.guests'::text));
create policy guests_write_delete on public.guests for delete to public
  using (may(auth.uid(), 'svc.guests'::text));

-- inventory_categories
drop policy if exists inventory_categories_write on public.inventory_categories;
create policy inventory_categories_write_insert on public.inventory_categories for insert to public
  with check (may(auth.uid(), 'inv.items'::text, department_id));
create policy inventory_categories_write_update on public.inventory_categories for update to public
  using (may(auth.uid(), 'inv.items'::text, department_id))
  with check (may(auth.uid(), 'inv.items'::text, department_id));
create policy inventory_categories_write_delete on public.inventory_categories for delete to public
  using (may(auth.uid(), 'inv.items'::text, department_id));

-- inventory_documents
drop policy if exists inventory_documents_write on public.inventory_documents;
create policy inventory_documents_write_insert on public.inventory_documents for insert to public
  with check ((EXISTS ( SELECT 1
   FROM inventory_items i
  WHERE ((i.id = inventory_documents.item_id) AND may(auth.uid(), 'inv.items'::text, i.department_id)))));
create policy inventory_documents_write_update on public.inventory_documents for update to public
  using ((EXISTS ( SELECT 1
   FROM inventory_items i
  WHERE ((i.id = inventory_documents.item_id) AND may(auth.uid(), 'inv.items'::text, i.department_id)))))
  with check ((EXISTS ( SELECT 1
   FROM inventory_items i
  WHERE ((i.id = inventory_documents.item_id) AND may(auth.uid(), 'inv.items'::text, i.department_id)))));
create policy inventory_documents_write_delete on public.inventory_documents for delete to public
  using ((EXISTS ( SELECT 1
   FROM inventory_items i
  WHERE ((i.id = inventory_documents.item_id) AND may(auth.uid(), 'inv.items'::text, i.department_id)))));

-- inventory_items
drop policy if exists inventory_items_write on public.inventory_items;
create policy inventory_items_write_insert on public.inventory_items for insert to public
  with check (may(auth.uid(), 'inv.items'::text, department_id));
create policy inventory_items_write_update on public.inventory_items for update to public
  using (may(auth.uid(), 'inv.items'::text, department_id))
  with check (may(auth.uid(), 'inv.items'::text, department_id));
create policy inventory_items_write_delete on public.inventory_items for delete to public
  using (may(auth.uid(), 'inv.items'::text, department_id));

-- rota_assignment_tags
drop policy if exists rota_assignment_tags_write on public.rota_assignment_tags;
create policy rota_assignment_tags_write_insert on public.rota_assignment_tags for insert to public
  with check ((EXISTS ( SELECT 1
   FROM rota_assignments a
  WHERE ((a.id = rota_assignment_tags.assignment_id) AND (NOT service_has_finished(a.service_id)) AND may(auth.uid(), 'rota.tag'::text, a.department_id, a.service_id)))));
create policy rota_assignment_tags_write_update on public.rota_assignment_tags for update to public
  using ((EXISTS ( SELECT 1
   FROM rota_assignments a
  WHERE ((a.id = rota_assignment_tags.assignment_id) AND (NOT service_has_finished(a.service_id)) AND may(auth.uid(), 'rota.tag'::text, a.department_id, a.service_id)))))
  with check ((EXISTS ( SELECT 1
   FROM rota_assignments a
  WHERE ((a.id = rota_assignment_tags.assignment_id) AND (NOT service_has_finished(a.service_id)) AND may(auth.uid(), 'rota.tag'::text, a.department_id, a.service_id)))));
create policy rota_assignment_tags_write_delete on public.rota_assignment_tags for delete to public
  using ((EXISTS ( SELECT 1
   FROM rota_assignments a
  WHERE ((a.id = rota_assignment_tags.assignment_id) AND (NOT service_has_finished(a.service_id)) AND may(auth.uid(), 'rota.tag'::text, a.department_id, a.service_id)))));

-- rota_assignments
drop policy if exists rota_assignments_write on public.rota_assignments;
create policy rota_assignments_write_insert on public.rota_assignments for insert to public
  with check (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id)));
create policy rota_assignments_write_update on public.rota_assignments for update to public
  using (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id)))
  with check (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id)));
create policy rota_assignments_write_delete on public.rota_assignments for delete to public
  using (((NOT service_has_finished(service_id)) AND may(auth.uid(), 'rota.assign'::text, department_id, service_id)));

-- rota_checklist_progress
drop policy if exists rota_checklist_progress_write on public.rota_checklist_progress;
create policy rota_checklist_progress_write_insert on public.rota_checklist_progress for insert to public
  with check ((checklist_item_writable(assignment_id, item_id) AND ((is_admin(auth.uid()) AND may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id))) OR (assignment_checklist_is_open(assignment_id) AND ((auth.uid() = rota_assignment_user(assignment_id)) OR may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id)) OR is_service_flow_signer(auth.uid(), rota_assignment_service(assignment_id)))))));
create policy rota_checklist_progress_write_update on public.rota_checklist_progress for update to public
  using ((checklist_item_writable(assignment_id, item_id) AND ((is_admin(auth.uid()) AND may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id))) OR (assignment_checklist_is_open(assignment_id) AND ((auth.uid() = rota_assignment_user(assignment_id)) OR may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id)) OR is_service_flow_signer(auth.uid(), rota_assignment_service(assignment_id)))))))
  with check ((checklist_item_writable(assignment_id, item_id) AND ((is_admin(auth.uid()) AND may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id))) OR (assignment_checklist_is_open(assignment_id) AND ((auth.uid() = rota_assignment_user(assignment_id)) OR may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id)) OR is_service_flow_signer(auth.uid(), rota_assignment_service(assignment_id)))))));
create policy rota_checklist_progress_write_delete on public.rota_checklist_progress for delete to public
  using ((checklist_item_writable(assignment_id, item_id) AND ((is_admin(auth.uid()) AND may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id))) OR (assignment_checklist_is_open(assignment_id) AND ((auth.uid() = rota_assignment_user(assignment_id)) OR may(auth.uid(), 'day.verify'::text, rota_assignment_department(assignment_id), rota_assignment_service(assignment_id)) OR is_service_flow_signer(auth.uid(), rota_assignment_service(assignment_id)))))));

-- rota_tags
drop policy if exists rota_tags_write on public.rota_tags;
create policy rota_tags_write_insert on public.rota_tags for insert to public
  with check (is_admin(auth.uid()));
create policy rota_tags_write_update on public.rota_tags for update to public
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));
create policy rota_tags_write_delete on public.rota_tags for delete to public
  using (is_admin(auth.uid()));

-- service_debrief_items
drop policy if exists service_debrief_items_overwatch_write on public.service_debrief_items;
create policy service_debrief_items_overwatch_write_insert on public.service_debrief_items for insert to public
  with check (overwatch_may_write_debrief(debrief_id));
create policy service_debrief_items_overwatch_write_update on public.service_debrief_items for update to public
  using (overwatch_may_write_debrief(debrief_id))
  with check (overwatch_may_write_debrief(debrief_id));
create policy service_debrief_items_overwatch_write_delete on public.service_debrief_items for delete to public
  using (overwatch_may_write_debrief(debrief_id));

-- service_series
drop policy if exists service_series_write on public.service_series;
create policy service_series_write_insert on public.service_series for insert to public
  with check (may(auth.uid(), 'svc.repeat'::text));
create policy service_series_write_update on public.service_series for update to public
  using (may(auth.uid(), 'svc.repeat'::text))
  with check (may(auth.uid(), 'svc.repeat'::text));
create policy service_series_write_delete on public.service_series for delete to public
  using (may(auth.uid(), 'svc.repeat'::text));

-- service_session_assignees
drop policy if exists service_session_assignees_substitute on public.service_session_assignees;
create policy service_session_assignees_substitute_insert on public.service_session_assignees for insert to public
  with check ((is_substitute AND planner_control(VARIADIC ARRAY['substitute'::text]) AND (NOT service_has_finished(session_service(session_id)))));
create policy service_session_assignees_substitute_update on public.service_session_assignees for update to public
  using ((is_substitute AND planner_control(VARIADIC ARRAY['substitute'::text]) AND (NOT service_has_finished(session_service(session_id)))))
  with check ((is_substitute AND planner_control(VARIADIC ARRAY['substitute'::text]) AND (NOT service_has_finished(session_service(session_id)))));
create policy service_session_assignees_substitute_delete on public.service_session_assignees for delete to public
  using ((is_substitute AND planner_control(VARIADIC ARRAY['substitute'::text]) AND (NOT service_has_finished(session_service(session_id)))));

-- service_session_assignees
drop policy if exists service_session_assignees_write on public.service_session_assignees;
create policy service_session_assignees_write_insert on public.service_session_assignees for insert to public
  with check ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, session_service(session_id)) AND (NOT service_has_finished(session_service(session_id)))));
create policy service_session_assignees_write_update on public.service_session_assignees for update to public
  using ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, session_service(session_id)) AND (NOT service_has_finished(session_service(session_id)))))
  with check ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, session_service(session_id)) AND (NOT service_has_finished(session_service(session_id)))));
create policy service_session_assignees_write_delete on public.service_session_assignees for delete to public
  using ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, session_service(session_id)) AND (NOT service_has_finished(session_service(session_id)))));

-- service_sessions
drop policy if exists service_sessions_write on public.service_sessions;
create policy service_sessions_write_insert on public.service_sessions for insert to public
  with check ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, service_id) AND (NOT service_has_finished(service_id))));
create policy service_sessions_write_update on public.service_sessions for update to public
  using ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, service_id) AND (NOT service_has_finished(service_id))))
  with check ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, service_id) AND (NOT service_has_finished(service_id))));
create policy service_sessions_write_delete on public.service_sessions for delete to public
  using ((may(auth.uid(), 'svc.sessions'::text, NULL::uuid, service_id) AND (NOT service_has_finished(service_id))));

-- service_template_sessions
drop policy if exists service_template_sessions_admin_write on public.service_template_sessions;
create policy service_template_sessions_admin_write_insert on public.service_template_sessions for insert to public
  with check (may(auth.uid(), 'svc.templates'::text));
create policy service_template_sessions_admin_write_update on public.service_template_sessions for update to public
  using (may(auth.uid(), 'svc.templates'::text))
  with check (may(auth.uid(), 'svc.templates'::text));
create policy service_template_sessions_admin_write_delete on public.service_template_sessions for delete to public
  using (may(auth.uid(), 'svc.templates'::text));

-- service_templates
drop policy if exists service_templates_admin_write on public.service_templates;
create policy service_templates_admin_write_insert on public.service_templates for insert to public
  with check (may(auth.uid(), 'svc.templates'::text));
create policy service_templates_admin_write_update on public.service_templates for update to public
  using (may(auth.uid(), 'svc.templates'::text))
  with check (may(auth.uid(), 'svc.templates'::text));
create policy service_templates_admin_write_delete on public.service_templates for delete to public
  using (may(auth.uid(), 'svc.templates'::text));

-- services
drop policy if exists services_write on public.services;
create policy services_write_insert on public.services for insert to public
  with check (may(auth.uid(), 'svc.manage'::text));
create policy services_write_update on public.services for update to public
  using (may(auth.uid(), 'svc.manage'::text))
  with check (may(auth.uid(), 'svc.manage'::text));
create policy services_write_delete on public.services for delete to public
  using (may(auth.uid(), 'svc.manage'::text));

-- set_list_items
drop policy if exists set_list_items_write on public.set_list_items;
create policy set_list_items_write_insert on public.set_list_items for insert to public
  with check (can_edit_set_list(auth.uid()));
create policy set_list_items_write_update on public.set_list_items for update to public
  using (can_edit_set_list(auth.uid()))
  with check (can_edit_set_list(auth.uid()));
create policy set_list_items_write_delete on public.set_list_items for delete to public
  using (can_edit_set_list(auth.uid()));

-- stage_areas
drop policy if exists stage_areas_admin_write on public.stage_areas;
create policy stage_areas_admin_write_insert on public.stage_areas for insert to public
  with check (is_admin(auth.uid()));
create policy stage_areas_admin_write_update on public.stage_areas for update to public
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));
create policy stage_areas_admin_write_delete on public.stage_areas for delete to public
  using (is_admin(auth.uid()));

-- stage_team_access
drop policy if exists stage_team_access_admin_write on public.stage_team_access;
create policy stage_team_access_admin_write_insert on public.stage_team_access for insert to public
  with check (is_admin(auth.uid()));
create policy stage_team_access_admin_write_update on public.stage_team_access for update to public
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));
create policy stage_team_access_admin_write_delete on public.stage_team_access for delete to public
  using (is_admin(auth.uid()));

-- team_poll_options
drop policy if exists team_poll_options_write on public.team_poll_options;
create policy team_poll_options_write_insert on public.team_poll_options for insert to public
  with check ((EXISTS ( SELECT 1
   FROM team_polls p
  WHERE ((p.id = team_poll_options.poll_id) AND (is_admin(auth.uid()) OR (p.created_by = auth.uid()) OR ((p.department_id IS NOT NULL) AND (( SELECT s.poll_managed_by
           FROM app_settings s
         LIMIT 1) = 'leads'::text) AND is_dept_head_or_assisting(auth.uid(), p.department_id)))))));
create policy team_poll_options_write_update on public.team_poll_options for update to public
  using ((EXISTS ( SELECT 1
   FROM team_polls p
  WHERE ((p.id = team_poll_options.poll_id) AND (is_admin(auth.uid()) OR (p.created_by = auth.uid()) OR ((p.department_id IS NOT NULL) AND (( SELECT s.poll_managed_by
           FROM app_settings s
         LIMIT 1) = 'leads'::text) AND is_dept_head_or_assisting(auth.uid(), p.department_id)))))))
  with check ((EXISTS ( SELECT 1
   FROM team_polls p
  WHERE ((p.id = team_poll_options.poll_id) AND (is_admin(auth.uid()) OR (p.created_by = auth.uid()) OR ((p.department_id IS NOT NULL) AND (( SELECT s.poll_managed_by
           FROM app_settings s
         LIMIT 1) = 'leads'::text) AND is_dept_head_or_assisting(auth.uid(), p.department_id)))))));
create policy team_poll_options_write_delete on public.team_poll_options for delete to public
  using ((EXISTS ( SELECT 1
   FROM team_polls p
  WHERE ((p.id = team_poll_options.poll_id) AND (is_admin(auth.uid()) OR (p.created_by = auth.uid()) OR ((p.department_id IS NOT NULL) AND (( SELECT s.poll_managed_by
           FROM app_settings s
         LIMIT 1) = 'leads'::text) AND is_dept_head_or_assisting(auth.uid(), p.department_id)))))));

-- user_roles
drop policy if exists user_roles_admin_write on public.user_roles;
create policy user_roles_admin_write_insert on public.user_roles for insert to public
  with check (is_admin(auth.uid()));
create policy user_roles_admin_write_update on public.user_roles for update to public
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));
create policy user_roles_admin_write_delete on public.user_roles for delete to public
  using (is_admin(auth.uid()));
