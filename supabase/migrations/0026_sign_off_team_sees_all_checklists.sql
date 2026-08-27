-- ============================================================================
-- The sign-off team can read every team's checklist
-- ============================================================================
-- Reading a checklist and signing it off are different things. Only the
-- person the rota puts on Service Flow for a service (or that team's head)
-- may give the final signature — that is unchanged — but everyone on the
-- sign-off team needs to see how the whole service is coming along,
-- whether or not they are the one rostered on it.
--
-- is_any_coordinator() is exactly "on the team that signs checklists off",
-- so the select policy gains it. The write policy is untouched: visibility
-- widens, authority does not.
drop policy if exists rota_checklist_progress_select on public.rota_checklist_progress;

create policy rota_checklist_progress_select on public.rota_checklist_progress
  for select using (
    auth.uid() = public.rota_assignment_user(assignment_id)
    or public.can_view_department_content(auth.uid(), public.rota_assignment_department(assignment_id))
    or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
    or public.is_any_coordinator(auth.uid())
  );
