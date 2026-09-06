-- ============================================================================
-- Deleting a service failed, and blamed the activity feed
-- ============================================================================
-- Pressing "Yes, delete service" answered:
--
--   insert or update on table "activity" violates foreign key constraint
--   "activity_service_id_fkey" — Key (service_id)=(…) is not present in
--   table "services".
--
-- Nothing was wrong with the delete. Deleting a service cascades to its
-- sessions and its rota assignments, and both of those tables carry an
-- AFTER DELETE trigger that writes a line to the activity feed — "Worship 1
-- removed", "Joel taken off Camera 2". Those triggers fire once the parent
-- row is already gone, so the line they write points at a service that no
-- longer exists, and the feed's own foreign key refuses it. The refusal
-- aborts the whole statement, so the service survives and the person
-- pressing the button is told something they cannot act on.
--
-- The feed is written by triggers precisely so it cannot disagree with what
-- happened (see 0041). That principle is what makes this a one-line fix in
-- the right place rather than six changes to six triggers: `record_activity`
-- is the single door every one of them goes through, so it is where the
-- check belongs.
--
-- It also stops recording a line at all when the service is going. That is
-- the correct outcome, not a compromise: the feed cascades away with the
-- service anyway, so the only line this could ever have written is one that
-- would be deleted microseconds later. "Deleted" is not an event in a feed
-- that is per-service — there is nothing left for it to be about.
--
-- The same held for the two nullable references. A team being deleted takes
-- its rota rows with it, and the line about them named the team by an id
-- that had just stopped existing; an account being removed did the same with
-- the actor. Both are recorded as null now — "someone", on "a team" — which
-- is what the columns are nullable for.

create or replace function public.record_activity(
  svc uuid,
  dept uuid,
  actor uuid,
  kind text,
  subject text default null,
  detail text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity (service_id, department_id, actor_id, kind, subject, detail)
  select
    svc,
    -- Null rather than a dangling id: the team may be going too.
    (select d.id from public.departments d where d.id = dept),
    (select p.id from public.profiles p where p.id = actor),
    kind,
    subject,
    detail
  where svc is not null
    -- The service is being deleted: this line would be refused by the
    -- foreign key, and would be cascaded away a moment later anyway.
    and exists (select 1 from public.services s where s.id = svc);
$$;
