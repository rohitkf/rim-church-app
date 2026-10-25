/*
 * Board posts and team chat reach the phone.
 *
 * Until now a message board post lit the bell and nothing more — one
 * `message` line per person until they read it, never pushed — and a post
 * in a team's chat did not notify anybody unless they were @mentioned.
 * The church wants both on people's phones.
 *
 * So both now push, without either piling up:
 *
 *   - A board post gives everybody who can open the board (but its author,
 *     and anybody it @mentions, who are told by `mention`) a `message` line
 *     saying who wrote what. Their unread one, if any, goes first: the bell
 *     still holds one line for the board, the newest, and because it is a
 *     fresh row every time, push-notify sends each post to the phone.
 *   - A post in a team's chat does the same as `team_chat`, one line per
 *     team, its `reference_id` the team (so a tap opens that room), to
 *     everybody who may read the room and is on the team or heads it.
 *     An Admin, who may read every room, is told only about their own
 *     teams'. Alerts are unchanged (`team_alert`).
 *
 * Each person can turn either off for themselves (`push_preferences`, a
 * row only once they have chosen): the bell still has the line, the phone
 * stays quiet. push-notify reads it. Nobody can see or set anybody else's.
 */

create table if not exists public.push_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  board boolean not null default true,
  team_chat boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.push_preferences is
  'What a person has asked not to be buzzed for. No row is everything on. Read by push-notify with the service role.';

alter table public.push_preferences enable row level security;

drop policy if exists push_preferences_select on public.push_preferences;
create policy push_preferences_select on public.push_preferences
  for select using (user_id = auth.uid());

drop policy if exists push_preferences_insert on public.push_preferences;
create policy push_preferences_insert on public.push_preferences
  for insert with check (user_id = auth.uid());

drop policy if exists push_preferences_update on public.push_preferences;
create policy push_preferences_update on public.push_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The board
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line text := left(coalesce(public.person_name(new.author_id) || ': ', '') || btrim(coalesce(new.body, '')), 160);
  told uuid[];
begin
  told := array(
    select p.id
    from public.profiles p
    where p.id <> new.author_id
      and public.can_open_page(p.id, 'messages')
      and not (p.id = any (coalesce(new.mentions, '{}'::uuid[])))
  );

  delete from public.notifications n
  where n.type = 'message' and n.read_boolean = false and n.user_id = any (told);

  insert into public.notifications (user_id, type, reference_id, body)
  select t, 'message', new.id, line from unnest(told) t;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A team's chat
-- ---------------------------------------------------------------------------

create or replace function public.notify_on_team_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients uuid[];
  told uuid[];
  line text;
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
        -- An answer counts only from somebody who is on the team today.
        select a.user_id from public.availability a
        join public.department_members m
          on m.department_id = a.department_id and m.user_id = a.user_id
        where a.service_id = new.service_id
          and a.department_id = new.department_id
          and a.status in ('available', 'tentative')
      );
    end if;

    perform public.notify_people(
      array(select unnest(recipients) except select new.author_id),
      'team_alert',
      new.id,
      new.body
    );
    return new;
  end if;

  if array_length(new.mentions, 1) is not null then
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

  -- Everybody else in the room: its team and its Heads, who may read it.
  told := array(
    select distinct who
    from (
      select m.user_id as who from public.department_members m where m.department_id = new.department_id
      union
      select r.user_id from public.user_roles r
      where r.department_id = new.department_id
        and r.role_type in ('department_head', 'assisting_head')
    ) room
    where who is not null
      and who <> new.author_id
      and not (who = any (coalesce(new.mentions, '{}'::uuid[])))
      and public.may(who, 'msg.chat', new.department_id)
  );
  if coalesce(array_length(told, 1), 0) = 0 then
    return new;
  end if;

  line := left(
    coalesce(public.person_name(new.author_id), 'Someone')
      || coalesce(' in ' || (select d.name from public.departments d where d.id = new.department_id), '')
      || ': ' || btrim(coalesce(new.body, '')),
    160
  );

  delete from public.notifications n
  where n.type = 'team_chat'
    and n.read_boolean = false
    and n.reference_id = new.department_id
    and n.user_id = any (told);

  insert into public.notifications (user_id, type, reference_id, body)
  select t, 'team_chat', new.department_id, line from unnest(told) t;

  return new;
end;
$$;

notify pgrst, 'reload schema';
