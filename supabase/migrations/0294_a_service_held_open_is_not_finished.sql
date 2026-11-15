/*
 * 0294 — A service held open is not finished
 *
 * A service counted as finished the moment its planned end passed, unless
 * End service had been pressed. That is wrong whenever somebody is saying
 * it has not ended: a session marked "Not started" (held_at, 0057) means
 * the one before it is still going, and the service marked "Not ended"
 * (end_held_at, 0292) means the last one is. On 15 November 2026 a service
 * twenty minutes into an overrun, with a session still waiting to start,
 * was filed under Finished on every list.
 *
 * The app's lists go by one rule (lib/serviceState.ts, serviceStanding),
 * and that rule now reads the holds. This is the database's half:
 * service_has_finished() is the lock that refuses changes to a running
 * order an hour after it ended, and it must not lock one that is still
 * running — or the button that starts the session being waited for would
 * be refused an hour into a long overrun.
 *
 * So: the end that was called, plus the grace, as before. Otherwise, while
 * a session that runs is marked not started, or the service is marked not
 * ended, it has not finished — for six hours past the planned end and no
 * longer, so a hold nobody cleared does not leave a Sunday editable until
 * Tuesday (HOLD_BELIEVED_MS in the app; a test holds the two to one
 * number). Otherwise the planned end plus the grace, as before.
 *
 * Only the lock changes. When a service counts as ended for the checklist,
 * issue and debrief windows is still service_ended_at(): the planned end
 * until End service is pressed, and the real one after.
 */
create or replace function public.service_has_finished(svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with svc as (
    select ended_at, end_held_at from public.services where id = svc_id
  ),
  plan as (
    select max(start_time + make_interval(mins => coalesce(duration_minutes, 0))) as ends,
           coalesce(bool_or(held_at is not null and skipped_at is null), false) as waiting
      from public.service_sessions
     where service_id = svc_id
  ),
  grace as (
    select make_interval(mins => (select edit_grace_minutes from public.app_settings)) as allowed
  )
  select coalesce(
    case
      -- The end was called: that is when it ended.
      when (select ended_at from svc) is not null
        then (select ended_at from svc) + (select allowed from grace) < now()
      -- Held open: a session not started yet, or the service not ended.
      when ((select end_held_at from svc) is not null or (select waiting from plan))
           and now() < (select ends from plan) + interval '6 hours'
        then false
      else (select ends from plan) + (select allowed from grace) < now()
    end,
    false
  );
$$;
select public.migration_done(294, '0294_a_service_held_open_is_not_finished', '52f5681fc545877cab51189c788835ef4eec4ce8bc4c6fc8f94ccb665c0b58cb');
