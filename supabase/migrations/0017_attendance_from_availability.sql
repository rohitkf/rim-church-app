-- ============================================================================
-- Attendance derives from availability
-- ============================================================================
-- Expected turnout is no longer a number somebody types: it's how many
-- volunteers said "available" in the Availability Tracker. Actual turnout
-- is that same list, confirmed person by person by the team's head on the
-- day — so the two figures are always about the same people, and the
-- dashboard can show the estimate and what actually happened side by side.
--
-- null = not yet checked, true = turned up, false = did not.
alter table public.availability add column attended boolean;

-- The head (and Admin) confirms turnout for their own team, so they need
-- to write rows they don't own. Note this widens their write access to the
-- whole row rather than just `attended` — RLS is row-level, and a team
-- head being able to correct their own team's availability is within the
-- trust they already have over that team's roster and checklist.
drop policy availability_update on public.availability;

create policy availability_update on public.availability
  for update using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
  );
