/*
 * A visa can carry a note.
 *
 * Somebody who has applied for a Graduate visa and is waiting to hear has
 * no expiry date to give, and "no expiry" is not true either. The profile
 * had nowhere to say "applied 3 October, waiting on a decision", so the
 * honest answer was left out, and the Owner could not tell a missing date
 * from a pending one.
 *
 * So the visa gets a short note in the person's own words, kept beside the
 * rest of it in `profile_sensitive`. That row's policies already make it
 * the person's and the Owner's alone (0126), and they cover every column,
 * this one included.
 */

alter table public.profile_sensitive
  add column if not exists visa_note text;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'profile_sensitive_visa_note_is_a_note') then
    alter table public.profile_sensitive
      add constraint profile_sensitive_visa_note_is_a_note check (length(visa_note) <= 300);
  end if;
end
$do$;

comment on column public.profile_sensitive.visa_note is
  'The person''s own note about their visa, e.g. "Applied 3 Oct, waiting on a decision". Only they and the Owner can read it.';

notify pgrst, 'reload schema';
