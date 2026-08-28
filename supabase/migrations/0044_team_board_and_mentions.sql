-- ============================================================================
-- The team board, mentions, and alerts that live somewhere
-- ============================================================================
-- Three things people ask of one page, kept apart on purpose:
--
--   * the message board, which everyone signed in can read and post to;
--   * a team's own board, which only that team can read — the same room the
--     rota, the checklist and the call time are already about;
--   * an alert, which a head or an Admin sends to that team and which
--     interrupts: it goes to their notifications, their phone, and a modal
--     they have to dismiss.
--
-- An alert is not a fourth kind of thing. It is a team board post that
-- announces itself, which is why it lives in the same table: it can then be
-- read back later by whoever was asleep when it arrived, instead of
-- existing only as a notification that vanishes when read.
--
-- Both boards clear on the same Tuesday as the main one. None of this is a
-- record; it is a week of talk about a service that has now happened.
-- ----------------------------------------------------------------------------

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  -- 'post' is chat; 'alert' interrupts.
  kind text not null default 'post' check (kind in ('post', 'alert')),
  -- Set when an alert is aimed at the people serving one service rather
  -- than the whole team.
  service_id uuid references public.services(id) on delete set null,
  -- Who was named with an @. Stored rather than re-parsed, because the
  -- roster changes and a mention should mean whoever it meant at the time.
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists team_messages_department_idx
  on public.team_messages (department_id, created_at desc);

alter table public.team_messages enable row level security;

-- The public board gains the same column: an @ works on both boards, and
-- the two should not disagree about what a mention is.
alter table public.messages add column if not exists mentions uuid[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Who may see and say what
-- ---------------------------------------------------------------------------
-- Reading is for the team: its members (core and guest alike — a guest on
-- Sunday needs the same call time as everyone else), whoever heads it, and
-- Admin. Nobody else, which is the whole point of a team board.
drop policy if exists team_messages_select on public.team_messages;
create policy team_messages_select on public.team_messages
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_dept_member(auth.uid(), department_id)
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
  );

-- Anyone who can read the room can talk in it, as themselves.
drop policy if exists team_messages_insert on public.team_messages;
create policy team_messages_insert on public.team_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and kind = 'post'
    and (
      public.is_admin(auth.uid())
      or public.is_dept_member(auth.uid(), department_id)
      or public.is_dept_head_or_assisting(auth.uid(), department_id)
    )
  );

-- An alert is never inserted directly: alert_team is the only way in, so
-- the "may I alert this team" check cannot be skipped by writing a row.

-- Your own words are yours to take back; an Admin can remove anyone's.
drop policy if exists team_messages_delete on public.team_messages;
create policy team_messages_delete on public.team_messages
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Telling people
-- ---------------------------------------------------------------------------
-- A mention is the only reason a chat message reaches beyond the room. An
-- alert reaches everyone it was aimed at. Both run as the definer so they
-- can write notification rows for other people, which no ordinary role may
-- do directly.
create or replace function public.notify_on_team_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients uuid[];
begin
  if new.kind = 'alert' then
    if new.service_id is null then
      recipients := array(
        select user_id from public.department_members where department_id = new.department_id
      );
    else
      recipients := array(
        select user_id from public.rota_assignments
        where service_id = new.service_id and department_id = new.department_id
        union
        select user_id from public.availability
        where service_id = new.service_id
          and department_id = new.department_id
          and status in ('available', 'tentative')
      );
    end if;

    perform public.notify_people(
      array(select unnest(recipients) except select new.author_id),
      'team_alert',
      new.id,
      new.body
    );
  elsif array_length(new.mentions, 1) is not null then
    -- Only people who can already read the room: an @ must not become a
    -- way to show an outsider what was said in it.
    perform public.notify_people(
      array(
        select m from unnest(new.mentions) as m
        where m <> new.author_id
          and (
            public.is_dept_member(m, new.department_id)
            or public.is_dept_head_or_assisting(m, new.department_id)
            or public.is_admin(m)
          )
      ),
      'mention',
      new.id,
      new.body
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_team_message on public.team_messages;
create trigger notify_on_team_message
  after insert on public.team_messages
  for each row execute function public.notify_on_team_message();

-- The public board already notifies everyone about a new post. A mention
-- there is a second, louder notification for the people actually named —
-- the board post is easy to scroll past, being named is not.
create or replace function public.notify_mentions_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if array_length(new.mentions, 1) is null then
    return new;
  end if;

  perform public.notify_people(
    array(select m from unnest(new.mentions) as m where m <> new.author_id),
    'mention',
    new.id,
    new.body
  );
  return new;
end;
$$;

drop trigger if exists notify_mentions_on_message on public.messages;
create trigger notify_mentions_on_message
  after insert on public.messages
  for each row execute function public.notify_mentions_on_message();

-- ---------------------------------------------------------------------------
-- Sending an alert
-- ---------------------------------------------------------------------------
-- Rewritten to write the alert down. It used to exist only as notification
-- rows, so an alert read on the way to church was gone by the time anyone
-- wanted to check what it said. Now it is a post on the team's own board
-- that also interrupts — the trigger above does the telling.
create or replace function public.alert_team(
  dept_id uuid,
  message text,
  svc_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  recipients integer;
begin
  if not public.may_alert_department(auth.uid(), dept_id) then
    raise exception 'Only an Admin or that team''s head can send this.';
  end if;
  if message is null or length(btrim(message)) = 0 then
    raise exception 'An alert needs something to say.';
  end if;
  if length(message) > 500 then
    raise exception 'Keep an alert under 500 characters.';
  end if;

  insert into public.team_messages (department_id, author_id, body, kind, service_id)
  values (dept_id, auth.uid(), btrim(message), 'alert', svc_id)
  returning id into new_id;

  select count(*) into recipients
  from public.notifications
  where type = 'team_alert' and reference_id = new_id;

  return recipients;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.alert_team(uuid, text, uuid) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The same Tuesday
-- ---------------------------------------------------------------------------
-- One week means one week everywhere: the team boards and the alerts go
-- when the main board does, along with the notifications that point at
-- rows which will no longer exist.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('clear-message-board');
    perform cron.schedule(
      'clear-message-board',
      '0 0 * * 2',
      $job$
        delete from public.notifications where type in ('message', 'mention', 'team_alert');
        delete from public.team_messages where ctid is not null;
        delete from public.messages where ctid is not null;
      $job$
    );
  end if;
end $$;

-- The team board is a chat: it has to arrive without a refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_messages'
    ) then
      alter publication supabase_realtime add table public.team_messages;
    end if;
  end if;
end $$;
