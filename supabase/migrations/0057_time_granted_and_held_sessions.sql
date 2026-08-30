-- ============================================================================
-- Two things that happen in a room and not in a plan
-- ============================================================================
--
-- The first: somebody asks for more time. The pastor wants ten more minutes,
-- and the running order should carry both the new length and the fact that
-- it was granted rather than planned — otherwise next month's plan gets
-- built from a 40-minute sermon that was only ever meant to be 30.
--
-- `added_minutes` is the running total handed over on request, so the planned
-- length is always duration_minutes - added_minutes. `added_note` is who
-- asked and what for.
--
-- The second: the clock reaches a session and it has not begun. Until now the
-- plan quietly moved on without it, and the session before it stopped
-- accruing overrun the moment its own planned end passed. `held_at` says
-- out loud that this one has not started yet: the session before it is still
-- running, its overrun keeps growing, and nothing starts here until somebody
-- presses the button.
alter table public.service_sessions
  add column if not exists added_minutes int not null default 0,
  add column if not exists added_note text,
  add column if not exists held_at timestamptz;

comment on column public.service_sessions.added_minutes is
  'Minutes granted on request during the service. The planned length is duration_minutes minus this.';
comment on column public.service_sessions.added_note is
  'Who asked for the extra time, and what for.';
comment on column public.service_sessions.held_at is
  'Set when the clock reached this session and it had not begun. Cleared when it starts.';

-- Time can be granted, not taken back into the negative, and a note with no
-- grant behind it is a leftover.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_sessions_added_minutes_not_negative'
  ) then
    alter table public.service_sessions
      add constraint service_sessions_added_minutes_not_negative check (added_minutes >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'service_sessions_added_note_needs_a_grant'
  ) then
    alter table public.service_sessions
      add constraint service_sessions_added_note_needs_a_grant
      check (added_note is null or added_minutes > 0);
  end if;
end $$;
