/*
 * Overwatch: sees everything, changes almost nothing.
 *
 * A church wants somebody — an elder, a pastor, whoever keeps an eye on
 * the whole Sunday — able to look at every team's rota, availability,
 * checklists, chat and debriefs without being given anything to run.
 * Admin is the wrong tool: it is the keys to the app. So Overwatch is a
 * role of its own, given by an Admin from the Volunteers page like Admin
 * is (`user_roles`, church-wide, `role_type = 'overwatch'`, 0186).
 *
 * What it reads. Every team's content, as an Admin would: the team-content
 * and team-reading helpers (`can_view_department_content`, `may_read_team`)
 * now say yes to Overwatch, and the reads that ask other questions get a
 * policy of their own, beside the existing ones, rather than a rewrite of
 * them. Contact details, compliance records and households stay the
 * Owner's (0126, 0149): "everything" means the church's running, not its
 * people's private files.
 *
 * Which pages. `app_settings.overwatch_pages` is page → open, and a page
 * it does not name is open; Volunteers starts closed. `can_open_page` reads
 * it, so the pages the database enforces follow it for Overwatch too.
 *
 * What it writes — five things, each a switch in Settings, all on to begin
 * with, and each only while its page is open to Overwatch:
 *   overwatch_board_posts   post on the message board (as themselves)
 *   overwatch_chat_posts    post in any team's chat
 *   overwatch_polls         ask polls, and change or remove their own
 *   overwatch_issues        raise issues, filed as raised by Overwatch
 *   overwatch_debriefs      write Overwatch's own debrief of a service
 * Nothing else: Overwatch holds no column in the permissions grid, so
 * `may()` gives it nothing it does not have as a member of some team.
 *
 * Its own group on Issues and Debriefs. An issue Overwatch raises carries
 * `raised_as_overwatch`, and the Issues page gathers them; a debrief with
 * no team (`department_id` null) is Overwatch's write-up of that service,
 * one per service, written by any of them while the debrief window is open.
 */

-- ---------------------------------------------------------------------------
-- The role
-- ---------------------------------------------------------------------------

alter table public.user_roles drop constraint if exists user_roles_scope_check;
alter table public.user_roles add constraint user_roles_scope_check check (
  (role_type in ('admin', 'overwatch') and department_id is null and service_id is null)
  or (role_type in ('department_head', 'assisting_head') and department_id is not null and service_id is null)
  or (role_type = 'service_flow_coordinator' and service_id is not null and department_id is null)
);

create or replace function public.is_overwatch(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'overwatch'
  );
$$;

-- ---------------------------------------------------------------------------
-- What the church sets for it
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists overwatch_pages jsonb not null default '{"volunteers": false}'::jsonb,
  add column if not exists overwatch_board_posts boolean not null default true,
  add column if not exists overwatch_chat_posts boolean not null default true,
  add column if not exists overwatch_polls boolean not null default true,
  add column if not exists overwatch_issues boolean not null default true,
  add column if not exists overwatch_debriefs boolean not null default true;

create or replace function public.overwatch_pages_is_valid(pages jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(pages) = 'object'
    and pg_column_size(pages) <= 4096
    and not exists (
      select 1 from jsonb_each(pages) e(page, open)
      where jsonb_typeof(e.open) <> 'boolean' or e.page !~ '^[a-z][a-z0-9-]{0,40}$'
    );
$$;

alter table public.app_settings drop constraint if exists app_settings_overwatch_pages_valid;
alter table public.app_settings
  add constraint app_settings_overwatch_pages_valid check (public.overwatch_pages_is_valid(overwatch_pages));

/* Overwatch, and this page open to it. */
create or replace function public.overwatch_sees(uid uuid, page text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_overwatch(uid) and coalesce(
    (select (s.overwatch_pages ->> page)::boolean from public.app_settings s limit 1),
    true
  );
$$;

/* One of the five things Overwatch may do, switched on, on a page open to it. */
create or replace function public.overwatch_may(uid uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case what
      when 'board'    then s.overwatch_board_posts and public.overwatch_sees(uid, 'messages')
      when 'chat'     then s.overwatch_chat_posts  and public.overwatch_sees(uid, 'team-chat')
      when 'polls'    then s.overwatch_polls       and public.overwatch_sees(uid, 'polls')
      when 'issues'   then s.overwatch_issues      and public.overwatch_sees(uid, 'issues')
      when 'debriefs' then s.overwatch_debriefs    and public.overwatch_sees(uid, 'debriefs')
      else false
    end
    from public.app_settings s limit 1
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Reading: pages, and every team's content
-- ---------------------------------------------------------------------------

create or replace function public.can_open_page(uid uuid, page text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or public.overwatch_sees(uid, page)
    or case public.page_level(page)
      when 'everyone' then true
      when 'team'     then public.is_on_a_team(uid)
      when 'leads'    then public.is_a_lead(uid)
      else false
    end
  );
$$;

create or replace function public.can_view_department_content(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(uid)
    or public.is_overwatch(uid)
    or public.is_dept_member(uid, dept_id)
    or public.is_dept_head_or_assisting(uid, dept_id);
$$;

create or replace function public.may_read_team(dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid())
      or public.is_overwatch(auth.uid())
      or public.is_dept_member(auth.uid(), dept_id)
      or public.is_dept_head_or_assisting(auth.uid(), dept_id);
$$;

-- The reads that ask something else, each given a policy of its own.
drop policy if exists activity_overwatch_read on public.activity;
create policy activity_overwatch_read on public.activity
  for select using (public.is_overwatch(auth.uid()));

drop policy if exists availability_history_overwatch_read on public.availability_history;
create policy availability_history_overwatch_read on public.availability_history
  for select using (public.overwatch_sees(auth.uid(), 'availability'));

drop policy if exists guest_availability_history_overwatch_read on public.guest_availability_history;
create policy guest_availability_history_overwatch_read on public.guest_availability_history
  for select using (public.overwatch_sees(auth.uid(), 'availability'));

drop policy if exists availability_change_requests_overwatch_read on public.availability_change_requests;
create policy availability_change_requests_overwatch_read on public.availability_change_requests
  for select using (public.overwatch_sees(auth.uid(), 'availability'));

drop policy if exists rota_release_requests_overwatch_read on public.rota_release_requests;
create policy rota_release_requests_overwatch_read on public.rota_release_requests
  for select using (public.overwatch_sees(auth.uid(), 'rota'));

drop policy if exists purchase_requests_overwatch_read on public.purchase_requests;
create policy purchase_requests_overwatch_read on public.purchase_requests
  for select using (public.overwatch_sees(auth.uid(), 'inventory'));

drop policy if exists team_join_requests_overwatch_read on public.team_join_requests;
create policy team_join_requests_overwatch_read on public.team_join_requests
  for select using (public.overwatch_sees(auth.uid(), 'departments'));

drop policy if exists service_issues_overwatch_read on public.service_issues;
create policy service_issues_overwatch_read on public.service_issues
  for select using (public.overwatch_sees(auth.uid(), 'issues'));

drop policy if exists team_messages_overwatch_read on public.team_messages;
create policy team_messages_overwatch_read on public.team_messages
  for select using (public.overwatch_sees(auth.uid(), 'team-chat'));

-- Every poll, to read; answering one stays with the people it asks.
drop policy if exists team_polls_overwatch_read on public.team_polls;
create policy team_polls_overwatch_read on public.team_polls
  for select using (public.overwatch_sees(auth.uid(), 'polls') and clears_at > now());

drop policy if exists team_poll_options_overwatch_read on public.team_poll_options;
create policy team_poll_options_overwatch_read on public.team_poll_options
  for select using (public.overwatch_sees(auth.uid(), 'polls'));

create or replace function public.poll_tallies(p_polls uuid[])
returns table(poll_id uuid, option_id uuid, votes integer, voters integer)
language sql
stable
security definer
set search_path = public
as $$
  select v.poll_id,
         v.option_id,
         count(*)::integer as votes,
         (select count(distinct w.user_id)
            from public.team_poll_votes w
           where w.poll_id = v.poll_id)::integer as voters
  from public.team_poll_votes v
  where v.poll_id = any (p_polls)
    and (public.may_see_poll(v.poll_id) or public.overwatch_sees(auth.uid(), 'polls'))
  group by v.poll_id, v.option_id;
$$;

-- Who voted, on a poll that is not anonymous, as anybody it is for sees it.
create or replace function public.may_see_poll_voters(poll uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_polls p
    where p.id = poll
      and (
        public.poll_is_for_me(
          p.audience, p.department_id, p.service_id, p.recipient_ids, p.created_by,
          p.include_guests, p.guest_ids
        )
        or (not p.anonymous and public.overwatch_sees(auth.uid(), 'polls'))
      )
      and (
        not p.anonymous
        or public.is_super_admin(auth.uid())
        or (
          (select s.poll_voters_seen_by from public.app_settings s limit 1) in ('admins', 'leads')
          and public.is_admin(auth.uid())
        )
        or (
          (select s.poll_voters_seen_by from public.app_settings s limit 1) = 'leads'
          and p.department_id is not null
          and public.is_dept_head_or_assisting(auth.uid(), p.department_id)
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Writing: the board, team chat, polls
-- ---------------------------------------------------------------------------

drop policy if exists messages_overwatch_post on public.messages;
create policy messages_overwatch_post on public.messages
  for insert with check (
    author_id = auth.uid() and department_id is null and public.overwatch_may(auth.uid(), 'board')
  );

drop policy if exists team_messages_overwatch_post on public.team_messages;
create policy team_messages_overwatch_post on public.team_messages
  for insert with check (
    author_id = auth.uid() and kind = 'post' and public.overwatch_may(auth.uid(), 'chat')
  );

drop policy if exists team_polls_overwatch_insert on public.team_polls;
create policy team_polls_overwatch_insert on public.team_polls
  for insert with check (created_by = auth.uid() and public.overwatch_may(auth.uid(), 'polls'));

drop policy if exists team_polls_overwatch_change on public.team_polls;
create policy team_polls_overwatch_change on public.team_polls
  for update
  using (created_by = auth.uid() and public.overwatch_may(auth.uid(), 'polls'))
  with check (created_by = auth.uid() and public.overwatch_may(auth.uid(), 'polls'));

-- ---------------------------------------------------------------------------
-- Issues, raised by Overwatch
-- ---------------------------------------------------------------------------

alter table public.service_issues
  add column if not exists raised_as_overwatch boolean not null default false;

comment on column public.service_issues.raised_as_overwatch is
  'Raised by somebody as Overwatch (0187) rather than as one of their teams. The Issues page gathers these.';

drop function if exists public.raise_issue(uuid, uuid, text, text, uuid);

create or replace function public.raise_issue(
  service uuid,
  team uuid,
  title text,
  details text default null,
  as_team uuid default null,
  as_overwatch boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  made uuid;
  w record;
  watching boolean := public.overwatch_may(auth.uid(), 'issues');
begin
  if not (public.may_raise_issue(auth.uid()) or watching) then
    raise exception 'Raising issues is not open to you — App settings say who may.'
      using errcode = '42501';
  end if;
  if coalesce(as_overwatch, false) and not watching then
    raise exception 'Only Overwatch can raise an issue as Overwatch.' using errcode = '42501';
  end if;
  if coalesce(as_overwatch, false) and as_team is not null then
    raise exception 'An issue is raised as Overwatch or as a team, not both.';
  end if;
  if not exists (select 1 from public.services where id = service) then
    raise exception 'That service is not there any more.';
  end if;

  if not public.raises_issues_any_time(auth.uid()) then
    select * into w from public.issue_window(service);
    if w.opens_at is null or w.closes_at is null then
      raise exception 'That service has no running order yet, so there is nothing to raise an issue against.';
    end if;
    if now() < w.opens_at then
      raise exception 'Issues for this service can be raised from %.',
        to_char(w.opens_at at time zone public.church_timezone(), 'HH24:MI on FMDay DD FMMonth')
        using errcode = '42501';
    end if;
    if now() > w.closes_at then
      raise exception 'This service closed for issues at %.',
        to_char(w.closes_at at time zone public.church_timezone(), 'HH24:MI on FMDay DD FMMonth')
        using errcode = '42501';
    end if;
  end if;

  if title is null or length(btrim(title)) = 0 then
    raise exception 'An issue needs a line saying what is wrong.';
  end if;
  if as_team is not null
     and not public.is_dept_member(auth.uid(), as_team)
     and not public.is_dept_head_or_assisting(auth.uid(), as_team) then
    raise exception 'You can only raise an issue as a team you are on.' using errcode = '42501';
  end if;

  insert into public.service_issues
    (service_id, department_id, title, details, raised_by, raised_by_department_id, raised_as_overwatch)
  values (
    service, team, btrim(title), nullif(btrim(coalesce(details, '')), ''), auth.uid(), as_team,
    coalesce(as_overwatch, false)
  )
  returning id into made;

  perform public.notify_people(
    array(
      select user_id from public.department_members where department_id = team
      union
      select user_id from public.user_roles
      where department_id = team and role_type in ('department_head', 'assisting_head')
    ),
    'service_issue',
    made,
    btrim(title)
  );
  return made;
end;
$$;

revoke all on function public.raise_issue(uuid, uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.raise_issue(uuid, uuid, text, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Debriefs: Overwatch's own write-up of a service
-- ---------------------------------------------------------------------------

alter table public.service_debriefs alter column department_id drop not null;

-- One per team per service, and one Overwatch write-up per service: a
-- missing team counts as the same "team" every time.
alter table public.service_debriefs drop constraint if exists service_debriefs_service_id_department_id_key;
alter table public.service_debriefs
  add constraint service_debriefs_service_id_department_id_key unique nulls not distinct (service_id, department_id);

comment on column public.service_debriefs.department_id is
  'The team whose debrief this is. Null is Overwatch''s write-up of the service (0187).';

/* Overwatch may write this debrief: it is theirs, and the window is open. */
create or replace function public.overwatch_may_write_debrief(debrief uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.service_debriefs d
    where d.id = debrief
      and d.department_id is null
      and public.overwatch_may(auth.uid(), 'debriefs')
      and public.debrief_window_open(d.service_id)
  );
$$;

drop policy if exists service_debriefs_overwatch_insert on public.service_debriefs;
create policy service_debriefs_overwatch_insert on public.service_debriefs
  for insert with check (
    written_by = auth.uid()
    and department_id is null
    and public.overwatch_may(auth.uid(), 'debriefs')
    and public.debrief_window_open(service_id)
  );

drop policy if exists service_debriefs_overwatch_change on public.service_debriefs;
create policy service_debriefs_overwatch_change on public.service_debriefs
  for update
  using (department_id is null and public.overwatch_may(auth.uid(), 'debriefs') and public.debrief_window_open(service_id))
  with check (department_id is null and public.overwatch_may(auth.uid(), 'debriefs') and public.debrief_window_open(service_id));

drop policy if exists service_debriefs_overwatch_delete on public.service_debriefs;
create policy service_debriefs_overwatch_delete on public.service_debriefs
  for delete using (
    department_id is null and public.overwatch_may(auth.uid(), 'debriefs') and public.debrief_window_open(service_id)
  );

drop policy if exists service_debrief_items_overwatch_write on public.service_debrief_items;
create policy service_debrief_items_overwatch_write on public.service_debrief_items
  for all
  using (public.overwatch_may_write_debrief(debrief_id))
  with check (public.overwatch_may_write_debrief(debrief_id));

-- The feed names a write-up with no team as Overwatch's.
create or replace function public.activity_from_debrief()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  team text;
begin
  select name into team from public.departments where id = row_now.department_id;
  if row_now.department_id is null then team := 'Overwatch'; end if;

  perform public.record_activity(
    row_now.service_id, row_now.department_id, coalesce(auth.uid(), row_now.written_by),
    'debrief', team,
    case tg_op
      when 'INSERT' then 'wrote up the debrief'
      when 'UPDATE' then 'updated the debrief'
      else 'removed the debrief'
    end
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.activity_from_debrief_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  parent record;
  team text;
  said text;
begin
  select service_id, department_id into parent
    from public.service_debriefs where id = row_now.debrief_id;
  -- The debrief itself is going, taking its items with it: that is one
  -- event, and 0100's trigger on the parent already says so.
  if not found then return coalesce(new, old); end if;

  select name into team from public.departments where id = parent.department_id;
  if parent.department_id is null then team := 'Overwatch'; end if;

  if tg_op = 'UPDATE' then
    if new.done_at is distinct from old.done_at then
      said := case when new.done_at is null then 'put a debrief item back' else 'ticked a debrief item off' end;
    elsif new.body is distinct from old.body or new.assigned_to is distinct from old.assigned_to then
      said := 'reworded a debrief item';
    else
      -- A re-order is not news, the same way the set list's isn't.
      return new;
    end if;
  else
    said := case when tg_op = 'INSERT' then 'added a debrief item' else 'removed a debrief item' end;
  end if;

  perform public.record_activity(
    parent.service_id, parent.department_id,
    coalesce(auth.uid(), row_now.created_by), 'debrief', team, said
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- The helpers are the database's own (0175): answered about anybody, so
-- not callable by name. Policies are untouched by that.
-- ---------------------------------------------------------------------------

revoke all on function public.is_overwatch(uuid) from public, anon;
grant execute on function public.is_overwatch(uuid) to authenticated;
revoke all on function public.overwatch_sees(uuid, text) from public, anon;
grant execute on function public.overwatch_sees(uuid, text) to authenticated;
revoke all on function public.overwatch_may(uuid, text) from public, anon;
grant execute on function public.overwatch_may(uuid, text) to authenticated;
revoke all on function public.overwatch_may_write_debrief(uuid) from public, anon;
grant execute on function public.overwatch_may_write_debrief(uuid) to authenticated;

create or replace function public.reject_removed_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  claims json;
  uid uuid;
  called text;
  -- The database's own helpers: policy predicates, resolvers and the grid.
  -- None of them is an API the app uses; every one answers about whatever
  -- uuid it is handed.
  helpers constant text[] := array[
    'is_admin', 'is_super_admin', 'is_dept_member', 'is_dept_head',
    'is_dept_head_or_assisting', 'is_any_department_head', 'is_on_a_team',
    'is_a_lead', 'has_dept_role', 'can_view_department_content',
    'is_any_coordinator', 'is_rota_coordinator', 'is_service_flow_signer',
    'is_service_coordinator', 'in_household', 'may', 'permission_reach',
    'can_open_page', 'page_level', 'stage_may', 'may_see_poll_voters',
    'poll_department', 'poll_is_open', 'session_service',
    'rota_assignment_user', 'rota_assignment_department',
    'rota_assignment_service', 'checklist_department', 'checklist_service',
    'stage_layout_service', 'service_has_finished', 'availability_is_closed',
    'planner_control', 'is_overwatch', 'overwatch_sees', 'overwatch_may',
    'overwatch_may_write_debrief'
  ];
begin
  -- No claims at all: an unauthenticated request. The sign-in page is one
  -- of those, so this must pass.
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    -- Unparseable claims are not this function's business, and refusing
    -- everything on a surprise here would take the app down. RLS remains
    -- the real gate; let it decide.
    return;
  end;
  if claims is null then return; end if;

  -- The database's own helpers are not the app's. Everyone but the service
  -- role is refused when the request names one of them by path; a policy
  -- that calls the same function never comes this way.
  if coalesce(claims ->> 'role', '') <> 'service_role' then
    called := substring(coalesce(current_setting('request.path', true), '')
                        from '(?:^|/)rpc/([A-Za-z0-9_]+)/?$');
    if called is not null and called = any (helpers) then
      raise insufficient_privilege
        using message = 'That function is the database''s own, not the app''s.',
              detail = 'not_an_rpc';
    end if;
  end if;

  -- Only ordinary signed-in people are checked. `service_role` is the
  -- edge functions and the scheduled jobs, which have no profile and are
  -- not supposed to; `anon` has no identity to remove.
  if coalesce(claims ->> 'role', '') <> 'authenticated' then return; end if;

  uid := auth.uid();
  if uid is null then return; end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise insufficient_privilege
      using message = 'Your account is no longer active.',
            detail = 'account_removed';
  end if;
end;
$$;

notify pgrst, 'reload schema';
