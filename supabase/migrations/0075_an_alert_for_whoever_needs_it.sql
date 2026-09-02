-- ---------------------------------------------------------------------------
-- An alert for whoever needs it
-- ---------------------------------------------------------------------------
-- Until now the only alert was a team alert: pick a team, and everyone on it
-- gets the banner they have to dismiss. That covers "sound check moved to
-- 8:30" and nothing else. The things an Admin actually needs to say — the
-- building is locked, this Sunday is cancelled, three of you please arrive
-- early — are aimed at everybody, at a few teams, or at named people, and
-- there was no way to say any of them.
--
-- So: an announcement. Same landing as a team alert — the notification
-- table, the bell, the phone, and the banner nobody scrolls past — with the
-- audience chosen by whoever is sending rather than fixed by the room they
-- are standing in.
--
-- The audience is resolved here rather than in the app. A client that sent
-- its own list of recipients would be a client that could alert anybody by
-- editing an array, so it sends the intent — everyone, these teams, these
-- people — and the database works out who that is and whether the sender
-- may say it at all.
-- ---------------------------------------------------------------------------

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  -- What was aimed at, kept as sent. The recipient list is not stored:
  -- notifications are the per-person record, and a team's membership on
  -- Sunday is not what it was on Friday — freezing a copy here would
  -- invite two answers to "who was told".
  audience text not null check (audience in ('everyone', 'teams', 'people')),
  department_ids uuid[] not null default '{}',
  user_ids uuid[] not null default '{}',
  recipient_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint announcements_body_length check (length(btrim(body)) between 1 and 500)
);

alter table public.announcements enable row level security;

create index if not exists announcements_created_idx on public.announcements (created_at desc);

-- Only an Admin reads the log of what has been sent, and nobody writes to
-- this table directly: send_announcement is the only way in, so the "may I
-- say this, and to whom" check cannot be stepped around by inserting a row.
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements
  for select to authenticated
  using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Saying it
-- ---------------------------------------------------------------------------
create or replace function public.send_announcement(
  message text,
  audience text,
  dept_ids uuid[] default '{}',
  people uuid[] default '{}'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  recipients uuid[];
  sent integer;
begin
  -- The one gate. Everything below assumes it has been passed.
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can send an announcement.';
  end if;
  if message is null or length(btrim(message)) = 0 then
    raise exception 'An announcement needs something to say.';
  end if;
  if length(btrim(message)) > 500 then
    raise exception 'Keep an announcement under 500 characters.';
  end if;
  if audience not in ('everyone', 'teams', 'people') then
    raise exception 'An announcement goes to everyone, to teams, or to people.';
  end if;
  if audience = 'teams' and coalesce(array_length(dept_ids, 1), 0) = 0 then
    raise exception 'Choose at least one team.';
  end if;
  if audience = 'people' and coalesce(array_length(people, 1), 0) = 0 then
    raise exception 'Choose at least one person.';
  end if;

  if audience = 'everyone' then
    recipients := array(select id from public.profiles);

  elsif audience = 'teams' then
    -- Members of the team, and whoever leads it. A head who runs a team
    -- without being on its roster is still someone that team's alert is
    -- for; leaving them out would be the sort of gap only noticed on the
    -- Sunday it mattered.
    recipients := array(
      select user_id from public.department_members
      where department_id = any(dept_ids)
      union
      select user_id from public.user_roles
      where department_id = any(dept_ids)
        and role_type in ('department_head', 'assisting_head')
    );

  else
    -- Named people, filtered to accounts that exist: an id for somebody
    -- who has since been removed is a row that would fail its foreign key
    -- and take the whole announcement down with it.
    recipients := array(
      select id from public.profiles where id = any(people)
    );
  end if;

  insert into public.announcements (author_id, body, audience, department_ids, user_ids)
  values (
    auth.uid(),
    btrim(message),
    audience,
    case when audience = 'teams' then dept_ids else '{}' end,
    case when audience = 'people' then people else '{}' end
  )
  returning id into new_id;

  -- notify_people skips the sender and anything it has already said to
  -- somebody in the last six hours.
  sent := public.notify_people(recipients, 'announcement', new_id, btrim(message));

  update public.announcements set recipient_count = sent where id = new_id;
  return sent;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.send_announcement(text, text, uuid[], uuid[]) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- What is deliberately not here
-- ---------------------------------------------------------------------------
-- No change to the board's clear-out. 0061 moved that from a cron
-- expression to `clear_message_board_if_due()`, which reads the day from
-- app_settings and runs every night — rescheduling the job here would have
-- pinned the church back to a Tuesday it did not choose. Announcements are
-- left to accumulate on the same terms as the team alerts they sit beside;
-- if that ever needs a broom it is a decision about both of them, made
-- where the day is already configurable, not a side effect of adding one.
