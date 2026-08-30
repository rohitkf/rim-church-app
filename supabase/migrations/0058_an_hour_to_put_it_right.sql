-- ============================================================================
-- An hour to put it right
-- ============================================================================
--
-- The running order locked the instant a service was over, which is the right
-- instinct and the wrong moment. The corrections you actually want to make —
-- a session nobody pressed the button on, a name spelt wrong, ten minutes
-- granted that never got recorded — are all noticed in the few minutes after
-- the last one, while people are still packing down and it is still fresh.
-- Being locked out then means the record is wrong for good, or somebody
-- reopens the whole service to fix a typo.
--
-- So the lock comes an hour late. Long enough to walk off a stage, find your
-- phone and fix what you noticed; short enough that a service is a settled
-- record by the time anyone comes back to it.
create or replace function public.service_has_finished(svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- When it ended: the moment somebody called it, or failing that the last
  -- session's planned end. Null when there is nothing to go on, which is not
  -- finished rather than finished.
  select coalesce(
    coalesce(
      (select ended_at from public.services where id = svc_id),
      (select max(start_time + make_interval(mins => coalesce(duration_minutes, 0)))
       from public.service_sessions where service_id = svc_id)
    ) + interval '1 hour' < now(),
    false
  );
$$;

comment on function public.service_has_finished(uuid) is
  'True once a service has been over for an hour. Until then an Admin can still correct the record.';
