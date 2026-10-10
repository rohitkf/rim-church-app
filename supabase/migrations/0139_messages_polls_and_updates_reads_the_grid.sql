/*
 * The church sets its own permissions: Messages, polls & updates.
 *
 * Posting to and tidying the message board, a team's chat, polls, church
 * updates, and alerts that reach phones. Who can open each page is still
 * the Pages tab's; who a poll is for is still the poll's audience.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('msg.board_post', 'admin', '{none,all}', 'all'),
  ('msg.board_post', 'head', '{none,team,all}', 'team'),
  ('msg.board_post', 'coordinator', '{none}', 'none'),
  ('msg.board_post', 'member', '{none,team,all}', 'team'),
  ('msg.board_post', 'newcomer', '{none}', 'none'),
  ('msg.board_moderate', 'admin', '{none,all}', 'all'),
  ('msg.board_moderate', 'head', '{none,all}', 'none'),
  ('msg.board_moderate', 'coordinator', '{none}', 'none'),
  ('msg.board_moderate', 'member', '{none,all}', 'none'),
  ('msg.board_moderate', 'newcomer', '{none}', 'none'),
  ('msg.chat', 'admin', '{none,all}', 'all'),
  ('msg.chat', 'head', '{none,team,all}', 'team'),
  ('msg.chat', 'coordinator', '{none}', 'none'),
  ('msg.chat', 'member', '{none,team,all}', 'team'),
  ('msg.chat', 'newcomer', '{none}', 'none'),
  ('msg.chat_moderate', 'admin', '{none,all}', 'all'),
  ('msg.chat_moderate', 'head', '{none,team,all}', 'none'),
  ('msg.chat_moderate', 'coordinator', '{none}', 'none'),
  ('msg.chat_moderate', 'member', '{none,team,all}', 'none'),
  ('msg.chat_moderate', 'newcomer', '{none}', 'none'),
  ('msg.polls', 'admin', '{none,all}', 'all'),
  ('msg.polls', 'head', '{none,team,all}', 'team'),
  ('msg.polls', 'coordinator', '{none}', 'none'),
  ('msg.polls', 'member', '{none,team,all}', 'none'),
  ('msg.polls', 'newcomer', '{none}', 'none'),
  ('msg.updates', 'admin', '{none,all}', 'all'),
  ('msg.updates', 'head', '{none,all}', 'none'),
  ('msg.updates', 'coordinator', '{none}', 'none'),
  ('msg.updates', 'member', '{none,all}', 'none'),
  ('msg.updates', 'newcomer', '{none}', 'none'),
  ('msg.alert_team', 'admin', '{none,all}', 'all'),
  ('msg.alert_team', 'head', '{none,team,all}', 'team'),
  ('msg.alert_team', 'coordinator', '{none,team}', 'none'),
  ('msg.alert_team', 'member', '{none,team,all}', 'none'),
  ('msg.alert_team', 'newcomer', '{none}', 'none'),
  ('msg.alert', 'admin', '{none,all}', 'all'),
  ('msg.alert', 'head', '{none,all}', 'none'),
  ('msg.alert', 'coordinator', '{none}', 'none'),
  ('msg.alert', 'member', '{none,all}', 'none'),
  ('msg.alert', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- A post with no team is church-wide, so only "Everywhere" reaches it.

alter policy messages_insert on public.messages
  with check ((author_id = auth.uid()) and public.may(auth.uid(), 'msg.board_post', department_id));

alter policy messages_delete on public.messages
  using ((author_id = auth.uid()) or public.may(auth.uid(), 'msg.board_moderate'));

CREATE OR REPLACE FUNCTION public.delete_message(message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  author uuid;
begin
  select author_id into author from public.messages where id = message_id;
  if author is null then
    raise exception 'That message no longer exists';
  end if;

  if not (author = auth.uid() or public.may(auth.uid(), 'msg.board_moderate')) then
    raise exception 'You can only delete your own posts';
  end if;

  delete from public.notifications where type = 'message' and reference_id = message_id;
  delete from public.messages where id = message_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.clear_message_board()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.may(auth.uid(), 'msg.board_moderate') then
    raise exception 'Clearing the message board is not open to you.';
  end if;

  delete from public.notifications where type = 'message';
  delete from public.messages where ctid is not null;
end;
$function$;

alter policy team_messages_select on public.team_messages
  using (public.may(auth.uid(), 'msg.chat', department_id));

alter policy team_messages_insert on public.team_messages
  with check ((author_id = auth.uid()) and (kind = 'post'::text) and public.may(auth.uid(), 'msg.chat', department_id));

alter policy team_messages_update on public.team_messages
  using ((author_id = auth.uid()) or public.may(auth.uid(), 'msg.chat_moderate', department_id))
  with check ((author_id = auth.uid()) or public.may(auth.uid(), 'msg.chat_moderate', department_id));

alter policy team_messages_delete on public.team_messages
  using ((author_id = auth.uid()) or public.may(auth.uid(), 'msg.chat_moderate', department_id));

-- A team or service poll is the team's; one for everybody or for named people needs "Everywhere".

alter policy team_polls_insert on public.team_polls
  with check ((created_by = auth.uid()) and (public.may(auth.uid(), 'msg.polls') or ((audience = any (array['team'::text, 'service'::text])) and (department_id is not null) and public.may(auth.uid(), 'msg.polls', department_id))));

alter policy team_polls_change on public.team_polls
  using (public.may(auth.uid(), 'msg.polls') or (created_by = auth.uid()) or ((department_id is not null) and public.may(auth.uid(), 'msg.polls', department_id)))
  with check (public.may(auth.uid(), 'msg.polls') or ((audience = any (array['team'::text, 'service'::text])) and (department_id is not null) and public.may(auth.uid(), 'msg.polls', department_id)));

alter policy team_polls_delete on public.team_polls
  using (public.may(auth.uid(), 'msg.polls') or (created_by = auth.uid()) or ((department_id is not null) and public.may(auth.uid(), 'msg.polls', department_id)));

alter policy team_poll_options_write on public.team_poll_options
  using (exists (select 1 from public.team_polls p where p.id = team_poll_options.poll_id and (public.may(auth.uid(), 'msg.polls') or (p.created_by = auth.uid()) or ((p.department_id is not null) and public.may(auth.uid(), 'msg.polls', p.department_id)))))
  with check (exists (select 1 from public.team_polls p where p.id = team_poll_options.poll_id and (public.may(auth.uid(), 'msg.polls') or (p.created_by = auth.uid()) or ((p.department_id is not null) and public.may(auth.uid(), 'msg.polls', p.department_id)))));

CREATE OR REPLACE FUNCTION public.post_church_update(title text, body text, pinned boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  made uuid;
begin
  if not public.may(auth.uid(), 'msg.updates') then
    raise exception 'Posting church updates is not open to you.' using errcode = '42501';
  end if;
  if title is null or length(btrim(title)) = 0 then
    raise exception 'An update needs a title.';
  end if;
  if body is null or length(btrim(body)) = 0 then
    raise exception 'An update needs something to say.';
  end if;

  insert into public.church_updates (title, body, pinned, created_by)
  values (btrim(title), btrim(body), coalesce(pinned, false), auth.uid())
  returning id into made;

  -- Everybody, in the app and on their phone. The words on the lock screen
  -- are the title; the rest is a tap away.
  perform public.notify_people(
    array(select id from public.profiles),
    'church_update',
    made,
    btrim(title)
  );
  return made;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_church_update(title text, body text, pinned boolean, ends_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  made uuid;
begin
  if not public.may(auth.uid(), 'msg.updates') then
    raise exception 'Posting church updates is not open to you.' using errcode = '42501';
  end if;
  if title is null or length(btrim(title)) = 0 then
    raise exception 'An update needs a title.';
  end if;
  if body is null or length(btrim(body)) = 0 then
    raise exception 'An update needs something to say.';
  end if;
  if ends_at is not null and ends_at <= now() then
    raise exception 'An update has to end in the future.';
  end if;
  if ends_at is not null and ends_at > now() + interval '366 days' then
    raise exception 'An update can run for a year at most.';
  end if;

  insert into public.church_updates (title, body, pinned, created_by, ends_at)
  values (btrim(title), btrim(body), coalesce(pinned, false), auth.uid(), ends_at)
  returning id into made;

  -- Everybody, in the app and on their phone. The words on the lock screen
  -- are the title; the rest is a tap away.
  perform public.notify_people(
    array(select id from public.profiles),
    'church_update',
    made,
    btrim(title)
  );
  return made;
end;
$function$;

alter policy church_updates_update on public.church_updates
  using (public.may(auth.uid(), 'msg.updates'))
  with check (public.may(auth.uid(), 'msg.updates'));

alter policy church_updates_delete on public.church_updates
  using (public.may(auth.uid(), 'msg.updates'));

CREATE OR REPLACE FUNCTION public.alert_team(dept_id uuid, message text, svc_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
  recipients integer;
begin
  if not public.may(auth.uid(), 'msg.alert_team', dept_id, svc_id) then
    raise exception 'Alerting that team is not open to you.';
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
$function$;

CREATE OR REPLACE FUNCTION public.send_announcement(message text, audience text, dept_ids uuid[] DEFAULT '{}'::uuid[], people uuid[] DEFAULT '{}'::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_id uuid;
  recipients uuid[];
  sent integer;
begin
  -- The one gate. Everything below assumes it has been passed.
  if not public.may(auth.uid(), 'msg.alert') then
    raise exception 'Sending alerts is not open to you.';
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
$function$;

-- The record of sent alerts is for whoever may send them.

alter policy announcements_select on public.announcements
  using (public.may(auth.uid(), 'msg.alert'));

notify pgrst, 'reload schema';
