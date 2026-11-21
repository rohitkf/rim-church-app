/*
 * A session can carry a note.
 *
 * A running order says what each session is, when, and who takes it. What
 * it had nowhere to say is the one thing about a session that is none of
 * those: "Communion follows, elements on the table by 10:40", "Two songs
 * only", "In Malayalam, translated". It went into the session's name,
 * which then ran to three lines, or into a message that was not in front
 * of whoever was running the service.
 *
 * So a session has a `note`: one piece of text, for everybody who reads
 * the running order, shown wherever the session is shown — the planner,
 * its Preview, the exported sheet, the Dashboard and the Countdown. The
 * Owner, November 2026: "Add ability to add NOTE for any session
 * (different from comments and visible in export and all that)".
 *
 * It is not a comment (0308). A comment is a Pastor's word to whoever
 * runs the church, private, its own rows and its own two rights. A note
 * is part of the plan: a column on the session, read by whoever reads the
 * session and written by whoever plans it.
 *
 * Who may write it needs no new rule. Changing a session is `svc.sessions`
 * until the service is over (the `_write_` policies, 0200). The planner's
 * buttons that can be given to somebody (0184) are guarded column by
 * column, and a column the guard does not name is refused — so a holder
 * of Add time or Skip cannot write a note, which is right: a note is
 * planning, not running.
 *
 * Null is no note. An empty one is not kept, and five hundred characters
 * is the most a card or a row of the sheet can carry and still be read.
 *
 * Nothing copies it. A template is names and lengths and a repeat makes
 * its services from one, so a note stays on the service it was written
 * for; a template edit that rewrites a service's sessions updates the
 * rows in place (0222), and the note stays on its row.
 */

alter table public.service_sessions
  add column if not exists note text;

comment on column public.service_sessions.note is
  'A note about the session for everybody who reads the running order: shown on the planner, the exported sheet, the Dashboard and the Countdown. Not a comment (service_session_comments), which is private.';

alter table public.service_sessions
  drop constraint if exists service_sessions_note_is_something;
alter table public.service_sessions
  add constraint service_sessions_note_is_something
  check (note is null or (btrim(note) <> '' and char_length(note) <= 500));
select public.migration_done(316, '0316_a_session_can_carry_a_note', '11c7d432aba5ba10a1aa9aeb96d5bb52670b61fd24abd1035ccdfb3ed5cece23');
