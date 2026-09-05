-- ============================================================================
-- Who is serving on Sunday is the teams' business as well
-- ============================================================================
-- 0080 shut the register, the notice board and the call times to somebody
-- who is on no team yet. The rota itself was left open — every assignment
-- has been readable by anyone signed in since 0015 — which means a brand
-- new account could still read the whole church's roster: who is on camera,
-- who is leading worship, every Sunday for a fortnight.
--
-- Availability and the checklists needed nothing: both have been scoped to
-- a team's own content since they were written, so they come back empty for
-- somebody on no team without a word from here.
-- ----------------------------------------------------------------------------

drop policy if exists rota_assignments_select on public.rota_assignments;
create policy rota_assignments_select on public.rota_assignments
  for select using (public.is_on_a_team(auth.uid()));
