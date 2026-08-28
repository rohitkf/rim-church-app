-- ============================================================================
-- The rota closes with the service too
-- ============================================================================
-- The last of the four places a finished service could still be changed.
-- Who served on a Sunday that has happened is a matter of record: adding
-- someone to it afterwards, or quietly taking them off, rewrites who was
-- there. And a request to borrow a volunteer for a service that is over
-- has nothing left to ask for.
-- ----------------------------------------------------------------------------

drop policy if exists rota_assignments_write on public.rota_assignments;
create policy rota_assignments_write on public.rota_assignments
  for all
  using (
    not public.service_has_finished(service_id)
    and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id))
  )
  with check (
    not public.service_has_finished(service_id)
    and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id))
  );

-- Borrowing someone: neither asked for nor decided once the service is
-- over. Withdrawing your own request stays open — that is tidying up a
-- question, not changing an answer.
drop policy if exists rota_release_requests_insert on public.rota_release_requests;
create policy rota_release_requests_insert on public.rota_release_requests
  for insert
  with check (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and requested_by = auth.uid()
    and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), requesting_department_id))
  );

drop policy if exists rota_release_requests_decide on public.rota_release_requests;
create policy rota_release_requests_decide on public.rota_release_requests
  for update
  using (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
    )
  )
  with check (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
    )
  );
