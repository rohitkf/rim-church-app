-- ============================================================================
-- A session that did not happen
-- ============================================================================
--
-- A running order is a plan, and a service is what actually happened. Until
-- now the two could only disagree about *timing*: pressing "session started"
-- moved a session to now and pushed the rest along. There was no way to say
-- a session did not happen at all — the notices were dropped because the
-- worship ran long, the testimony was cut because the speaker arrived late.
--
-- Deleting the session would say it was never planned, which is a different
-- claim and loses the reason. So it is marked instead: it keeps its place in
-- the order, takes no time in the cascade, and carries the reason it was
-- dropped.
alter table public.service_sessions
  add column if not exists skipped_at timestamptz,
  add column if not exists skip_reason text;

comment on column public.service_sessions.skipped_at is
  'Set when the session was dropped during the service. It keeps its place in the running order but takes no time.';
comment on column public.service_sessions.skip_reason is
  'Why it was dropped, in the words of whoever dropped it.';

-- A reason with nothing to explain is a leftover from an un-skip.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_sessions_skip_reason_needs_a_skip'
  ) then
    alter table public.service_sessions
      add constraint service_sessions_skip_reason_needs_a_skip
      check (skip_reason is null or skipped_at is not null);
  end if;
end $$;
