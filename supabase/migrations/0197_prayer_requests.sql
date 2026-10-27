/*
 * Prayer Requests (0196 adds the Pastor role this uses).
 *
 * A page in the menu for everybody signed in (Settings › Page by page can
 * narrow it), where:
 *  - anybody asks for prayer, either privately — the pastors and the Owner
 *    read it, nobody else — or for the whole church, with or without their
 *    name. An anonymous request still shows its author to the Owner and the
 *    pastors, so somebody can reach out, and so abuse can be taken down;
 *  - anybody answers a request they can see with one response, which they
 *    can change: I prayed (once), Still praying, or Fasting & praying. The
 *    counts are everybody's to see; who gave them, only the author's and
 *    the pastors';
 *  - the author adds updates, and in the end marks it answered — with their
 *    own words if they like, and their name only if they choose — which
 *    makes it a testimony for everybody (a private one only if they tick to
 *    share it), or closes it as no longer needed. Either can be undone.
 *
 * "The pastors" are everybody with the Pastor role, the Owner, and whoever
 * the church adds in Settings › Prayer. Admins do not read private requests;
 * they can take down a general one.
 *
 * Everything goes through the functions below: the table is not readable
 * directly, because an anonymous request's author has to be kept from the
 * people it is shown to, and a row policy cannot hide one column.
 *
 * Kept: closed requests 30 days after closing, testimonies 30 days after
 * being answered — both Data & Retention settings, testimonies able to be
 * kept for ever.
 */

-- ---------------------------------------------------------------------------
-- The role
-- ---------------------------------------------------------------------------

alter table public.user_roles drop constraint if exists user_roles_scope_check;
alter table public.user_roles add constraint user_roles_scope_check check (
  (role_type in ('admin', 'overwatch', 'pastor') and department_id is null and service_id is null)
  or (role_type in ('department_head', 'assisting_head') and department_id is not null and service_id is null)
  or (role_type = 'service_flow_coordinator' and service_id is not null and department_id is null)
);

create or replace function public.is_pastor(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'pastor'
  );
$$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists prayer_carers jsonb not null default '{"teams": [], "people": []}'::jsonb,
  add column if not exists prayer_closed_retention_days integer not null default 30,
  add column if not exists prayer_testimony_retention_days integer default 30;

alter table public.app_settings drop constraint if exists app_settings_prayer_carers_valid;
alter table public.app_settings
  add constraint app_settings_prayer_carers_valid check (public.clock_in_audience_is_valid(prayer_carers));
alter table public.app_settings drop constraint if exists app_settings_prayer_closed_retention_days_check;
alter table public.app_settings
  add constraint app_settings_prayer_closed_retention_days_check check (prayer_closed_retention_days between 1 and 365);
alter table public.app_settings drop constraint if exists app_settings_prayer_testimony_retention_days_check;
alter table public.app_settings
  add constraint app_settings_prayer_testimony_retention_days_check
  check (prayer_testimony_retention_days is null or prayer_testimony_retention_days between 1 and 3650);

/** The pastors, as this page means it: Pastor, the Owner, and whoever Settings › Prayer adds. */
create or replace function public.prayer_pastoral(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_pastor(uid)
    or exists (select 1 from public.app_owner o where o.user_id = uid)
    or exists (
      select 1 from public.app_settings s
      where s.prayer_carers -> 'people' ? uid::text
         or exists (
              select 1 from jsonb_array_elements_text(s.prayer_carers -> 'teams') t(id)
              where t.id ~ '^[0-9a-f-]{36}$'
                and (public.is_dept_member(uid, t.id::uuid) or public.is_dept_head_or_assisting(uid, t.id::uuid))
            )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- The page
-- ---------------------------------------------------------------------------

create or replace function public.page_access_is_valid(access jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(access) = 'object'
    and pg_column_size(access) <= 4096
    and not exists (
      select 1
      from jsonb_each(access) as e(page, level)
      where jsonb_typeof(e.level) <> 'string'
         or e.level #>> '{}' <> all (
              case e.page
                when 'service-planner' then array['everyone', 'team', 'leads']
                when 'rota'            then array['everyone', 'team']
                when 'set-lists'       then array['everyone', 'team', 'leads']
                when 'debriefs'        then array['team', 'leads']
                when 'messages'        then array['everyone', 'team', 'leads']
                when 'updates'         then array['everyone', 'team', 'leads']
                when 'polls'           then array['everyone', 'team']
                when 'events'          then array['everyone', 'team', 'leads']
                when 'giving'          then array['everyone', 'team', 'leads']
                when 'departments'     then array['everyone', 'team']
                when 'inventory'       then array['team', 'leads']
                when 'stage'           then array['everyone', 'team', 'leads']
                when 'prayer'          then array['everyone', 'team']
                else array[]::text[]
              end
            )
    );
$$;

create or replace function public.page_level(page text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.page_access ->> page from public.app_settings s limit 1),
    case page
      when 'service-planner' then 'everyone'
      when 'set-lists'       then 'everyone'
      when 'updates'         then 'everyone'
      when 'polls'           then 'everyone'
      when 'events'          then 'everyone'
      when 'giving'          then 'everyone'
      when 'stage'           then 'everyone'
      when 'prayer'          then 'everyone'
      -- Teams, from here on, is for people on a team.
      else 'team'
    end
  );
$$;

/*
 * Into the menu beside Events, wherever the church has put Events — a new
 * page the saved arrangement does not know goes into its default group,
 * and this church has renamed that group.
 */
update public.app_settings s
set nav_layout = jsonb_set(
  s.nav_layout,
  '{groups}',
  (
    select jsonb_agg(
      case when g -> 'items' ? '/events' then jsonb_set(g, '{items}', (g -> 'items') || '["/prayer"]'::jsonb) else g end
      order by n
    )
    from jsonb_array_elements(s.nav_layout -> 'groups') with ordinality as x(g, n)
  )
)
where s.nav_layout is not null
  and jsonb_typeof(s.nav_layout -> 'groups') = 'array'
  and not (s.nav_layout::text like '%"/prayer"%')
  and exists (select 1 from jsonb_array_elements(s.nav_layout -> 'groups') g where g -> 'items' ? '/events');

-- ---------------------------------------------------------------------------
-- The requests
-- ---------------------------------------------------------------------------

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('private', 'general')),
  body text not null check (length(btrim(body)) between 1 and 2000),
  -- A general request without the author's name on it.
  anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answered_at timestamptz,
  closed_at timestamptz,
  -- In the author's words, when they marked it answered.
  testimony text check (testimony is null or length(testimony) <= 2000),
  -- The testimony carries their name. Off unless they tick it.
  testimony_named boolean not null default false,
  -- A private request, answered, shared with everybody as a testimony.
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'general' or not anonymous),
  check (kind = 'private' or not shared)
);
create index if not exists prayer_requests_status on public.prayer_requests (status, created_at desc);
create index if not exists prayer_requests_author on public.prayer_requests (author_id);

create table if not exists public.prayer_responses (
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('prayed', 'praying', 'fasting')),
  at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table if not exists public.prayer_updates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists prayer_updates_request on public.prayer_updates (request_id, created_at);

-- Read and written only through the functions below.
alter table public.prayer_requests enable row level security;
alter table public.prayer_responses enable row level security;
alter table public.prayer_updates enable row level security;
revoke all on public.prayer_requests, public.prayer_responses, public.prayer_updates from anon, authenticated;

/** Whether somebody may see a request at all. */
create or replace function public.prayer_may_see(uid uuid, r public.prayer_requests)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    r.author_id = uid
    or public.prayer_pastoral(uid)
    or (
      public.can_open_page(uid, 'prayer')
      and (
        (r.kind = 'general' and r.status in ('open', 'answered'))
        or (r.kind = 'private' and r.status = 'answered' and r.shared)
      )
    )
  );
$$;

/**
 * Everything the page shows this person, in one answer: who they are to
 * it, and every request they may see, the author's name kept back where
 * it should be.
 */
create or replace function public.prayer_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pastoral boolean := public.prayer_pastoral(uid);
  admin boolean := public.is_admin(uid);
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not public.can_open_page(uid, 'prayer') and not pastoral then
    raise exception 'Prayer Requests is not open to you.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'pastoral', pastoral,
    'moderator', pastoral or admin,
    'requests', coalesce((
      select jsonb_agg(item order by created_at desc)
      from (
        select r.created_at, jsonb_build_object(
          'id', r.id,
          'kind', r.kind,
          'status', r.status,
          'body', r.body,
          'anonymous', r.anonymous,
          'mine', r.author_id = uid,
          'created_at', r.created_at,
          'updated_at', r.updated_at,
          'answered_at', r.answered_at,
          'closed_at', r.closed_at,
          'testimony', r.testimony,
          'testimony_named', r.testimony_named,
          'shared', r.shared,
          -- The name, unless it is being kept back from this person.
          'author', case
            when r.author_id = uid or pastoral
              or (r.status = 'answered' and r.testimony_named)
              or (r.status <> 'answered' and not r.anonymous)
            then (select jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name)
                  from public.profiles p where p.id = r.author_id)
          end,
          'counts', jsonb_build_object(
            'prayed', (select count(*) from public.prayer_responses x where x.request_id = r.id and x.kind = 'prayed'),
            'praying', (select count(*) from public.prayer_responses x where x.request_id = r.id and x.kind = 'praying'),
            'fasting', (select count(*) from public.prayer_responses x where x.request_id = r.id and x.kind = 'fasting')
          ),
          'my_response', (select x.kind from public.prayer_responses x where x.request_id = r.id and x.user_id = uid),
          'responders', case when r.author_id = uid or pastoral then coalesce((
              select jsonb_agg(jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'kind', x.kind) order by x.at desc)
              from public.prayer_responses x join public.profiles p on p.id = x.user_id
              where x.request_id = r.id
            ), '[]'::jsonb) end,
          'updates', coalesce((
            select jsonb_agg(jsonb_build_object('id', u.id, 'body', u.body, 'created_at', u.created_at) order by u.created_at desc)
            from public.prayer_updates u where u.request_id = r.id
          ), '[]'::jsonb)
        ) as item
        from public.prayer_requests r
        where public.prayer_may_see(uid, r)
      ) shown
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Asking, answering, keeping it up to date
-- ---------------------------------------------------------------------------

create or replace function public.prayer_ask(kind text, body text, anonymous boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  made uuid;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not public.can_open_page(uid, 'prayer') and not public.prayer_pastoral(uid) then
    raise exception 'Prayer Requests is not open to you.' using errcode = '42501';
  end if;
  if kind not in ('private', 'general') then raise exception 'Say who it is for.'; end if;
  if nullif(btrim(coalesce(body, '')), '') is null then raise exception 'Write what to pray for.'; end if;
  insert into public.prayer_requests (author_id, kind, body, anonymous)
  values (uid, kind, left(btrim(body), 2000), kind = 'general' and coalesce(anonymous, false))
  returning id into made;
  return made;
end;
$$;

/** The author's own, while it is open. */
create or replace function public.prayer_edit(request_id uuid, body text, anonymous boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(body, '')), '') is null then raise exception 'Write what to pray for.'; end if;
  update public.prayer_requests r
  set body = left(btrim(prayer_edit.body), 2000),
      anonymous = r.kind = 'general' and coalesce(prayer_edit.anonymous, false),
      updated_at = now()
  where r.id = request_id and r.author_id = auth.uid() and r.status = 'open';
  if not found then raise exception 'That request cannot be changed now.'; end if;
end;
$$;

/** One response per person, changeable; null takes it back. Only on an open request they can see. */
create or replace function public.prayer_respond(request_id uuid, response text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.prayer_requests%rowtype;
begin
  select * into r from public.prayer_requests where id = request_id;
  if not found or not public.prayer_may_see(uid, r) then raise exception 'That request has gone.'; end if;
  if r.status <> 'open' then raise exception 'That request is no longer open.'; end if;
  if response is null then
    delete from public.prayer_responses x where x.request_id = r.id and x.user_id = uid;
    return;
  end if;
  if response not in ('prayed', 'praying', 'fasting') then raise exception 'That is not a response.'; end if;
  insert into public.prayer_responses (request_id, user_id, kind)
  values (r.id, uid, response)
  on conflict on constraint prayer_responses_pkey do update set kind = excluded.kind, at = now();
end;
$$;

create or replace function public.prayer_add_update(request_id uuid, body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  made uuid;
begin
  if nullif(btrim(coalesce(body, '')), '') is null then raise exception 'Write the update.'; end if;
  if not exists (
    select 1 from public.prayer_requests r
    where r.id = request_id and r.author_id = auth.uid() and r.status = 'open'
  ) then
    raise exception 'Only the person who asked can add an update, while it is open.';
  end if;
  insert into public.prayer_updates (request_id, body) values (request_id, left(btrim(body), 1000)) returning id into made;
  update public.prayer_requests set updated_at = now() where id = request_id;
  return made;
end;
$$;

create or replace function public.prayer_remove_update(update_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.prayer_updates u
  using public.prayer_requests r
  where u.id = update_id and r.id = u.request_id and r.author_id = auth.uid();
  if not found then raise exception 'That update has gone.'; end if;
end;
$$;

/**
 * Answered: a testimony, in their words if they gave any. A general one is
 * everybody's to see; a private one only if they share it. Named only if
 * they say so. Answering again changes the words or the choices.
 */
create or replace function public.prayer_answer(request_id uuid, testimony text default null, named boolean default false, share boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prayer_requests r
  set status = 'answered',
      answered_at = case when r.status = 'answered' then r.answered_at else now() end,
      closed_at = null,
      testimony = left(nullif(btrim(coalesce(prayer_answer.testimony, '')), ''), 2000),
      testimony_named = coalesce(named, false),
      shared = r.kind = 'private' and coalesce(share, false),
      updated_at = now()
  where r.id = request_id and r.author_id = auth.uid() and r.status in ('open', 'answered');
  if not found then raise exception 'That request cannot be marked answered now.'; end if;
end;
$$;

/** No longer needed: out of everybody's way, and gone after the retention days. */
create or replace function public.prayer_close(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prayer_requests r
  set status = 'closed', closed_at = now(), answered_at = null,
      testimony = null, testimony_named = false, shared = false, updated_at = now()
  where r.id = request_id and r.author_id = auth.uid() and r.status = 'open';
  if not found then raise exception 'That request cannot be closed now.'; end if;
end;
$$;

/** Undo answered or closed: back to open, as it was asked. */
create or replace function public.prayer_reopen(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prayer_requests r
  set status = 'open', answered_at = null, closed_at = null,
      testimony = null, testimony_named = false, shared = false, updated_at = now()
  where r.id = request_id and r.author_id = auth.uid() and r.status in ('answered', 'closed');
  if not found then raise exception 'That request cannot be reopened.'; end if;
end;
$$;

/**
 * Taken down: by its author; by the pastors, any request; by an Admin, one
 * everybody can see (a general request, or a shared testimony) — never a
 * private one, which an Admin does not read.
 */
create or replace function public.prayer_remove(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  delete from public.prayer_requests r
  where r.id = request_id
    and (
      r.author_id = uid
      or public.prayer_pastoral(uid)
      or (public.is_admin(uid) and (r.kind = 'general' or r.shared))
    );
  if not found then raise exception 'That request cannot be removed by you.'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keeping
-- ---------------------------------------------------------------------------

create or replace function public.delete_old_prayer_requests()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_days integer := coalesce((select prayer_closed_retention_days from public.app_settings limit 1), 30);
  answered_days integer := (select prayer_testimony_retention_days from public.app_settings limit 1);
begin
  delete from public.prayer_requests where status = 'closed' and closed_at < now() - make_interval(days => closed_days);
  if answered_days is not null then
    delete from public.prayer_requests where status = 'answered' and answered_at < now() - make_interval(days => answered_days);
  end if;
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'delete-old-prayer-requests';
    perform cron.schedule('delete-old-prayer-requests', '55 2 * * *', 'select public.delete_old_prayer_requests()');
  end if;
end;
$cron$;

-- ---------------------------------------------------------------------------
-- Grants, and the helpers kept off the API
-- ---------------------------------------------------------------------------

-- Used only inside the functions here, never by the app or a policy.
revoke all on function public.is_pastor(uuid) from public, anon, authenticated;
revoke all on function public.prayer_pastoral(uuid) from public, anon, authenticated;
revoke all on function public.prayer_may_see(uuid, public.prayer_requests) from public, anon, authenticated;
revoke all on function public.delete_old_prayer_requests() from public, anon, authenticated;
revoke all on function public.prayer_board() from public, anon;
grant execute on function public.prayer_board() to authenticated;
revoke all on function public.prayer_ask(text, text, boolean) from public, anon;
grant execute on function public.prayer_ask(text, text, boolean) to authenticated;
revoke all on function public.prayer_edit(uuid, text, boolean) from public, anon;
grant execute on function public.prayer_edit(uuid, text, boolean) to authenticated;
revoke all on function public.prayer_respond(uuid, text) from public, anon;
grant execute on function public.prayer_respond(uuid, text) to authenticated;
revoke all on function public.prayer_add_update(uuid, text) from public, anon;
grant execute on function public.prayer_add_update(uuid, text) to authenticated;
revoke all on function public.prayer_remove_update(uuid) from public, anon;
grant execute on function public.prayer_remove_update(uuid) to authenticated;
revoke all on function public.prayer_answer(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.prayer_answer(uuid, text, boolean, boolean) to authenticated;
revoke all on function public.prayer_close(uuid) from public, anon;
grant execute on function public.prayer_close(uuid) to authenticated;
revoke all on function public.prayer_reopen(uuid) from public, anon;
grant execute on function public.prayer_reopen(uuid) to authenticated;
revoke all on function public.prayer_remove(uuid) from public, anon;
grant execute on function public.prayer_remove(uuid) to authenticated;

notify pgrst, 'reload schema';
