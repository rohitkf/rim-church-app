-- ============================================================================
-- A finished service is a record, not a draft
-- ============================================================================
-- Once the last session's end has passed, the running order stops being a
-- plan and becomes what happened. Editing it after that is almost always a
-- mistake — the wrong service opened, a stray tap on a phone in a pocket —
-- and the cost of the mistake is that the record of a Sunday quietly stops
-- matching the Sunday.
--
-- Enforced here rather than only in the page, because a rule that lives in
-- the interface is not a rule: anything holding a token can write straight
-- past it. The page greys the controls; this makes them impossible.
--
-- Deliberately narrow. It locks the plan — the sessions and the service's
-- guest list — and nothing else. Attendance is still marked after the
-- doors close, checklists are still signed off, and an Admin can still
-- delete a service outright, which stays as the way out if one was created
-- by mistake: the cascade is the correction path, not a quiet rewrite.
-- ----------------------------------------------------------------------------

-- Finished is a fact about the clock, exactly as the dashboard reads it:
-- the last session's start plus its length, against now. A service with no
-- running order has no end to have passed, so it is never finished.
create or replace function public.service_has_finished(svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    max(start_time + make_interval(mins => coalesce(duration_minutes, 0))) < now(),
    false
  )
  from public.service_sessions
  where service_id = svc_id;
$$;

drop policy if exists service_sessions_write on public.service_sessions;
create policy service_sessions_write on public.service_sessions
  for all
  using (public.is_admin(auth.uid()) and not public.service_has_finished(service_id))
  with check (public.is_admin(auth.uid()) and not public.service_has_finished(service_id));

drop policy if exists service_guests_write on public.service_guests;
create policy service_guests_write on public.service_guests
  for all
  using (public.is_admin(auth.uid()) and not public.service_has_finished(service_id))
  with check (public.is_admin(auth.uid()) and not public.service_has_finished(service_id));
