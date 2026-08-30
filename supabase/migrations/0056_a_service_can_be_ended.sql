-- ============================================================================
-- Calling the end of a service
-- ============================================================================
--
-- A service finishing has been a fact about the clock: once the last
-- session's planned end has passed, it is over. That is right when nothing
-- slips, and wrong every other time — a service that closes fifteen minutes
-- early still reads as running, and the last session can never record an
-- overrun because there is nothing after it to measure against.
--
-- So the end becomes something that can be said out loud. `ended_at` is when
-- somebody called it; until they do, the clock rule stands exactly as before.
alter table public.services
  add column if not exists ended_at timestamptz;

comment on column public.services.ended_at is
  'When the service was called ended. Null means fall back to the clock: over once the last session''s planned end has passed.';

-- Ending it closes the running order to changes the same way the clock does.
-- Clearing `ended_at` is how an Admin reopens one — the services table has
-- its own admin-only write policy, which this deliberately does not gate, so
-- ending a service by mistake is undoable.
create or replace function public.service_has_finished(svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select ended_at is not null and ended_at <= now()
              from public.services where id = svc_id), false)
    or coalesce(
      (select max(start_time + make_interval(mins => coalesce(duration_minutes, 0))) < now()
       from public.service_sessions where service_id = svc_id),
      false
    );
$$;
