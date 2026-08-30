-- ============================================================================
-- Granted time sits beside the plan, not inside it
-- ============================================================================
--
-- Granting a session ten minutes used to add them to duration_minutes, so a
-- 90-minute session became a 100-minute one and the length it was actually
-- given disappeared. That is the wrong number to lose: the plan's own figure
-- is what next month gets built from, and "we planned 90 and ran 108" is a
-- different thing to learn than "we planned 108".
--
-- So duration_minutes goes back to meaning the planned length and never
-- moves when time is granted. What was handed over is kept beside it: every
-- grant in `added_grants` with its own minutes and reason, and their sum in
-- `added_minutes`. How long the session actually runs is the two added up,
-- which is what every calculation of the running order now uses.
alter table public.service_sessions
  add column if not exists added_grants jsonb not null default '[]'::jsonb;

comment on column public.service_sessions.added_grants is
  'One entry per grant of extra time: {minutes, note, at}. Their total is added_minutes.';
comment on column public.service_sessions.duration_minutes is
  'The planned length. Time granted during the service is added_minutes; the session runs for the two together.';

-- Existing rows had their grants folded into duration_minutes. Take them back
-- out, so the planned length is a planned length again, and record what was
-- granted as the one grant we know about.
update public.service_sessions
   set duration_minutes = greatest(duration_minutes - added_minutes, 0),
       added_grants = jsonb_build_array(
         jsonb_build_object(
           'minutes', added_minutes,
           'note', added_note,
           'at', coalesce(updated_at, now())
         )
       )
 where added_minutes > 0
   and added_grants = '[]'::jsonb;

-- The note now belongs to the grant that carries it.
alter table public.service_sessions drop constraint if exists service_sessions_added_note_needs_a_grant;
alter table public.service_sessions drop column if exists added_note;
