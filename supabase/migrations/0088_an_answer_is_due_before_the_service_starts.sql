-- ============================================================================
-- An answer is due before the service starts
-- ============================================================================
-- "Can you serve on Sunday?" is a question asked in advance so a rota can
-- be built from the answers. It stopped being one at the moment the doors
-- opened — but nothing said so: `availability_update` let anybody change
-- their own answer at any time, including from the car park, including
-- after the head had already built the morning around the yes.
--
-- So a person's own answer closes when the service starts. Not when it
-- finishes, which is far too late to be useful to anyone, and not at the
-- team's call time, which is a different rule about a different thing (the
-- checklist, 0079): a rota is built from answers hours or days before, and
-- the first session starting is the moment the answers stopped being a
-- plan and became what actually happened.
--
-- **The override is unchanged.** An Admin may still put an answer right at
-- any time, because somebody has to be able to correct a record after the
-- fact. A Head still may not change what somebody said they could do —
-- that is not new here, it is `availability_guard_own_answer`, which has
-- always let only the volunteer or an Admin move a status. The Head keeps
-- the update rights that rule leaves them: marking who actually turned up.
--
-- Insert and delete keep exactly the people they had. It would have been
-- easy to add the Head here for symmetry, and wrong: the guard trigger
-- fires on UPDATE only, so a Head allowed to insert could write a "yes"
-- for somebody who never gave one — the very thing the trigger exists to
-- prevent, walked around rather than through.
--
-- A service with no running order has no start to have passed, so its
-- answers stay open. Same reasoning as `service_has_finished`: guessing a
-- start from the date would close a service nobody has planned yet.

/**
 * Whether the first session of this service has begun.
 *
 * No grace period, deliberately. `service_has_finished` allows an hour
 * afterwards because it guards a record being tidied up; this guards a
 * question being answered, and a question answered ten minutes after the
 * doors opened is not an answer, it is a note about the past.
 */
create or replace function public.service_has_started(svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select min(start_time) from public.service_sessions where service_id = svc_id) <= now(),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Who may write an answer, and until when
-- ---------------------------------------------------------------------------

drop policy if exists availability_update on public.availability;
create policy availability_update on public.availability
  for update using (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
    or (user_id = auth.uid() and not public.service_has_started(service_id))
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
    or (user_id = auth.uid() and not public.service_has_started(service_id))
  );

-- Insert and delete keep their existing outer bound — nothing may be added
-- or removed once the service is finished and settled — and the same
-- people they always had. Only the member's half is narrowed.
drop policy if exists availability_insert on public.availability;
create policy availability_insert on public.availability
  for insert with check (
    not public.service_has_finished(service_id)
    and (
      public.is_admin(auth.uid())
      or (user_id = auth.uid() and not public.service_has_started(service_id))
    )
  );

drop policy if exists availability_delete on public.availability;
create policy availability_delete on public.availability
  for delete using (
    not public.service_has_finished(service_id)
    and (
      public.is_admin(auth.uid())
      or (user_id = auth.uid() and not public.service_has_started(service_id))
    )
  );
