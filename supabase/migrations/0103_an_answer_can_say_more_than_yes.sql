/*
 * An answer can say more than yes.
 *
 * "Yes" and "no" carry most of what a head needs, but not the part that
 * changes the morning: somebody can serve and still not be there until
 * half nine, or can serve but not lift, or is driving somebody else who
 * cannot. Today all of that arrives by WhatsApp, which means it reaches
 * whoever happened to be looking at their phone and nobody else — and the
 * tracker, which is where the head actually plans from, still says a
 * confident "Yes".
 *
 * The column has been there since 0002 and nothing has ever written to
 * it. This migration is what makes it safe to.
 *
 * **A note is the volunteer's own words.** It appears beside their name
 * and speaks for them, so it is protected exactly as their answer is:
 * theirs to write, an Admin's to correct, and nobody else's — a head can
 * read it and act on it, but not put words in somebody's mouth.
 *
 * **And it reaches the feed.** 0100 went through everything that happens
 * to a service and gave it a line. A note saying "not until 9.30" changes
 * a morning as much as a status does.
 */

-- Long enough for "will be there but not until 9.30, dropping the kids
-- first", short enough that it stays a note rather than a message.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'availability_note_is_a_note'
  ) then
    alter table public.availability
      add constraint availability_note_is_a_note check (length(note) <= 200);
  end if;
end $$;

comment on column public.availability.note is
  'What the volunteer wanted said alongside their answer — "there but not until 9.30". Theirs to write; an Admin may correct it; nobody else.';

/**
 * Whose answer, and whose words.
 *
 * Unchanged except that the note is now held to the same rule as the
 * status. Without this a head could rewrite what somebody said about
 * themselves, which is the one thing a note beside a name must not be.
 */
create or replace function public.availability_guard_own_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id <> auth.uid() and not public.is_admin(auth.uid()) then
    if new.status is distinct from old.status then
      raise exception 'Only the volunteer can change their own availability';
    end if;
    if new.note is distinct from old.note then
      raise exception 'Only the volunteer can change their own note';
    end if;
    if new.user_id is distinct from old.user_id
       or new.service_id is distinct from old.service_id
       or new.department_id is distinct from old.department_id then
      raise exception 'An availability answer cannot be moved to another person or service';
    end if;
  end if;
  return new;
end;
$$;

/**
 * The feed, now including what the note said happened.
 *
 * Everything else here is 0100's, unchanged: every direction, attributed
 * to whoever did it, naming the person when the two differ.
 */
create or replace function public.activity_from_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  team text;
  actor uuid := coalesce(auth.uid(), row_now.user_id);
  owner_suffix text := case
    when actor is distinct from row_now.user_id
      then ' for ' || coalesce(public.person_name(row_now.user_id), 'somebody')
    else ''
  end;
begin
  select name into team from public.departments where id = row_now.department_id;

  if tg_op = 'DELETE' then
    perform public.record_activity(
      old.service_id, old.department_id, actor, 'availability', team,
      'removed' || owner_suffix
    );
    return old;
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.record_activity(
      new.service_id, new.department_id, actor, 'availability', team,
      new.status::text || owner_suffix
    );
  end if;

  -- The note, which the wording layer turns into a sentence. Said as a
  -- change rather than quoted: the feed says to go and look, and the note
  -- itself lives next to the name where it means something.
  if nullif(btrim(coalesce(new.note, '')), '')
     is distinct from nullif(btrim(coalesce(old.note, '')), '') then
    perform public.record_activity(
      new.service_id, new.department_id, actor, 'availability', team,
      case
        when nullif(btrim(coalesce(new.note, '')), '') is null then 'note removed'
        when tg_op = 'INSERT' or nullif(btrim(coalesce(old.note, '')), '') is null then 'note added'
        else 'note changed'
      end || owner_suffix
    );
  end if;

  if tg_op = 'UPDATE' and new.attended is distinct from old.attended then
    perform public.record_activity(
      new.service_id, new.department_id, actor, 'attendance', team,
      case
        when new.attended is null then 'attendance cleared' || owner_suffix
        when new.attended then 'turned up' || owner_suffix
        else 'did not turn up' || owner_suffix
      end
    );
  elsif tg_op = 'INSERT' and new.attended is not null then
    perform public.record_activity(
      new.service_id, new.department_id, actor, 'attendance', team,
      case when new.attended then 'turned up' else 'did not turn up' end || owner_suffix
    );
  end if;

  return new;
end;
$$;
