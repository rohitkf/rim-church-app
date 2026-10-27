/*
 * Prayer Requests, part 2 (0197): asking members to pray on the pastors'
 * behalf, prayer lists, and being told.
 *
 *  - Assigning: a pastor (or whoever Settings › Prayer names) asks one or
 *    more members to pray for a request — a general one or a private one.
 *    They see it under "Asked to pray", and can respond to it.
 *  - Prayer lists: a named list ("Friday chain prayer") of requests, seen
 *    by the people and teams on it, so they can pray through it together.
 *    Run by the pastors, or whoever Settings › Prayer names.
 *  - Either way, the person who asked privately is named to them only if
 *    the pastor ticks "Show who asked"; an anonymous general request stays
 *    anonymous whatever is ticked.
 *  - Notifications: the pastors when a private request comes in; a member
 *    when they are asked to pray; a list's people when a request is added
 *    to it; and whoever is still praying or fasting when a request has an
 *    update or is answered.
 */

-- ---------------------------------------------------------------------------
-- Who may assign, and who runs lists
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists prayer_assigners jsonb not null default '{"teams": [], "people": []}'::jsonb,
  add column if not exists prayer_list_runners jsonb not null default '{"teams": [], "people": []}'::jsonb;

alter table public.app_settings drop constraint if exists app_settings_prayer_assigners_valid;
alter table public.app_settings
  add constraint app_settings_prayer_assigners_valid check (public.clock_in_audience_is_valid(prayer_assigners));
alter table public.app_settings drop constraint if exists app_settings_prayer_list_runners_valid;
alter table public.app_settings
  add constraint app_settings_prayer_list_runners_valid check (public.clock_in_audience_is_valid(prayer_list_runners));

/** Whether somebody is in a teams-and-people list. */
create or replace function public.in_audience(uid uuid, audience jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    coalesce(audience -> 'people', '[]'::jsonb) ? uid::text
    or exists (
      select 1 from jsonb_array_elements_text(coalesce(audience -> 'teams', '[]'::jsonb)) t(id)
      where t.id ~ '^[0-9a-f-]{36}$'
        and (public.is_dept_member(uid, t.id::uuid) or public.is_dept_head_or_assisting(uid, t.id::uuid))
    )
  );
$$;

create or replace function public.prayer_may_assign(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.prayer_pastoral(uid)
    or public.in_audience(uid, (select prayer_assigners from public.app_settings limit 1));
$$;

create or replace function public.prayer_may_run_lists(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.prayer_pastoral(uid)
    or public.in_audience(uid, (select prayer_list_runners from public.app_settings limit 1));
$$;

-- ---------------------------------------------------------------------------
-- Assigning
-- ---------------------------------------------------------------------------

create table if not exists public.prayer_assignments (
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  -- Name the person who asked. Only means anything for a private request.
  show_name boolean not null default false,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
create index if not exists prayer_assignments_user on public.prayer_assignments (user_id);

-- ---------------------------------------------------------------------------
-- Prayer lists
-- ---------------------------------------------------------------------------

create table if not exists public.prayer_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- Who sees it: teams (members and heads) and people.
  members jsonb not null default '{"teams": [], "people": []}'::jsonb check (public.clock_in_audience_is_valid(members)),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.prayer_list_items (
  list_id uuid not null references public.prayer_lists(id) on delete cascade,
  request_id uuid not null references public.prayer_requests(id) on delete cascade,
  show_name boolean not null default false,
  added_by uuid references public.profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (list_id, request_id)
);

alter table public.prayer_assignments enable row level security;
alter table public.prayer_lists enable row level security;
alter table public.prayer_list_items enable row level security;
revoke all on public.prayer_assignments, public.prayer_lists, public.prayer_list_items from anon, authenticated;

/** Whether somebody is on a list: one of its people, or on one of its teams. */
create or replace function public.prayer_on_list(uid uuid, l public.prayer_lists)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.in_audience(uid, l.members);
$$;

-- ---------------------------------------------------------------------------
-- Who sees a request, and whose name they see
-- ---------------------------------------------------------------------------

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
    -- Asked to pray for it, or on a list it is on — until it is closed.
    or (
      r.status <> 'closed'
      and (
        exists (select 1 from public.prayer_assignments a where a.request_id = r.id and a.user_id = uid)
        or exists (
          select 1 from public.prayer_list_items i join public.prayer_lists l on l.id = i.list_id
          where i.request_id = r.id and public.prayer_on_list(uid, l)
        )
      )
    )
  );
$$;

/** Whether this person is to be told who asked. */
create or replace function public.prayer_names_author(uid uuid, r public.prayer_requests)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select r.author_id = uid
    or public.prayer_pastoral(uid)
    or (r.status = 'answered' and r.testimony_named)
    or (r.status <> 'answered' and r.kind = 'general' and not r.anonymous)
    -- A private request, named by the pastor who passed it on.
    or (
      r.status <> 'answered' and r.kind = 'private'
      and (
        exists (select 1 from public.prayer_assignments a where a.request_id = r.id and a.user_id = uid and a.show_name)
        or exists (
          select 1 from public.prayer_list_items i join public.prayer_lists l on l.id = i.list_id
          where i.request_id = r.id and i.show_name and public.prayer_on_list(uid, l)
        )
      )
    );
$$;

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
  assigner boolean := public.prayer_may_assign(uid);
  runner boolean := public.prayer_may_run_lists(uid);
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not public.can_open_page(uid, 'prayer') and not pastoral and not exists (
    select 1 from public.prayer_assignments a where a.user_id = uid
  ) then
    raise exception 'Prayer Requests is not open to you.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'pastoral', pastoral,
    'moderator', pastoral or admin,
    'may_assign', assigner,
    'may_run_lists', runner,
    'lists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'name', l.name,
        'mine', public.prayer_on_list(uid, l),
        -- Who is on it is the runners' to see and change.
        'members', case when runner then l.members end,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('request_id', i.request_id, 'show_name', i.show_name) order by i.added_at)
          from public.prayer_list_items i join public.prayer_requests r on r.id = i.request_id
          where i.list_id = l.id and public.prayer_may_see(uid, r)
        ), '[]'::jsonb)
      ) order by l.name)
      from public.prayer_lists l
      where runner or public.prayer_on_list(uid, l)
    ), '[]'::jsonb),
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
          'author', case when public.prayer_names_author(uid, r)
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
          ), '[]'::jsonb),
          -- Asked of this person, by whom, and why.
          'assigned_to_me', (
            select jsonb_build_object(
              'note', a.note,
              'by', (select jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name) from public.profiles p where p.id = a.assigned_by),
              'at', a.created_at
            )
            from public.prayer_assignments a where a.request_id = r.id and a.user_id = uid
          ),
          -- Who has been asked, and how they have responded: the assigners'.
          'assignees', case when assigner then coalesce((
              select jsonb_agg(jsonb_build_object(
                'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'show_name', a.show_name,
                'response', (select x.kind from public.prayer_responses x where x.request_id = r.id and x.user_id = a.user_id)
              ) order by a.created_at)
              from public.prayer_assignments a join public.profiles p on p.id = a.user_id
              where a.request_id = r.id
            ), '[]'::jsonb) end
        ) as item
        from public.prayer_requests r
        where public.prayer_may_see(uid, r)
      ) shown
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Assigning
-- ---------------------------------------------------------------------------

create or replace function public.prayer_assign(request_id uuid, people uuid[], show_name boolean default false, note text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.prayer_requests%rowtype;
  added integer;
  by_name text;
begin
  if not public.prayer_may_assign(uid) then
    raise exception 'You cannot ask people to pray for a request.' using errcode = '42501';
  end if;
  select * into r from public.prayer_requests where id = request_id;
  if not found or not public.prayer_may_see(uid, r) then raise exception 'That request has gone.'; end if;
  if r.status <> 'open' then raise exception 'That request is no longer open.'; end if;
  if coalesce(array_length(people, 1), 0) = 0 then raise exception 'Choose who to ask.'; end if;

  with made as (
    insert into public.prayer_assignments (request_id, user_id, assigned_by, show_name, note)
    select r.id, p.id, uid, r.kind = 'private' and coalesce(prayer_assign.show_name, false),
           left(nullif(btrim(coalesce(prayer_assign.note, '')), ''), 500)
    from public.profiles p
    where p.id = any (people) and p.id <> r.author_id
    on conflict on constraint prayer_assignments_pkey do nothing
    returning user_id
  ),
  told as (
    insert into public.notifications (user_id, type, reference_id, body)
    select m.user_id, 'prayer_assigned', r.id,
      coalesce(nullif((select btrim(first_name || ' ' || last_name) from public.profiles where id = uid), ''), 'A pastor')
        || ' asked you to pray: “' || left(r.body, 80) || case when length(r.body) > 80 then '…' else '' end || '”'
    from made m
    returning 1
  )
  select count(*) into added from told;
  return added;
end;
$$;

create or replace function public.prayer_unassign(request_id uuid, person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.prayer_may_assign(auth.uid()) then
    raise exception 'You cannot change who is asked to pray.' using errcode = '42501';
  end if;
  delete from public.prayer_assignments a where a.request_id = prayer_unassign.request_id and a.user_id = person;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lists
-- ---------------------------------------------------------------------------

/** Make a list, or change its name and who is on it. */
create or replace function public.prayer_list_save(list_id uuid, name text, members jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  saved uuid;
begin
  if not public.prayer_may_run_lists(uid) then
    raise exception 'You cannot run prayer lists.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(name, '')), '') is null then raise exception 'Give the list a name.'; end if;
  if not public.clock_in_audience_is_valid(coalesce(members, '{}'::jsonb)) then raise exception 'That is not a list of people.'; end if;
  if list_id is null then
    insert into public.prayer_lists (name, members, created_by)
    values (left(btrim(name), 80), members, uid)
    returning id into saved;
  else
    update public.prayer_lists l set name = left(btrim(prayer_list_save.name), 80), members = prayer_list_save.members
    where l.id = list_id
    returning l.id into saved;
    if saved is null then raise exception 'That list has gone.'; end if;
  end if;
  return saved;
end;
$$;

create or replace function public.prayer_list_delete(list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.prayer_may_run_lists(auth.uid()) then
    raise exception 'You cannot run prayer lists.' using errcode = '42501';
  end if;
  delete from public.prayer_lists l where l.id = list_id;
end;
$$;

create or replace function public.prayer_list_add(list_id uuid, request_id uuid, show_name boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.prayer_requests%rowtype;
  l public.prayer_lists%rowtype;
begin
  if not public.prayer_may_run_lists(uid) then
    raise exception 'You cannot run prayer lists.' using errcode = '42501';
  end if;
  select * into l from public.prayer_lists where id = list_id;
  if not found then raise exception 'That list has gone.'; end if;
  select * into r from public.prayer_requests where id = request_id;
  if not found or not public.prayer_may_see(uid, r) then raise exception 'That request has gone.'; end if;
  if r.status <> 'open' then raise exception 'That request is no longer open.'; end if;

  insert into public.prayer_list_items (list_id, request_id, show_name, added_by)
  values (l.id, r.id, r.kind = 'private' and coalesce(show_name, false), uid)
  on conflict on constraint prayer_list_items_pkey do update set show_name = excluded.show_name;

  -- Everybody on the list, but the one who added it and the one who asked.
  insert into public.notifications (user_id, type, reference_id, body)
  select p.id, 'prayer_listed', r.id,
    'Added to ' || l.name || ': “' || left(r.body, 80) || case when length(r.body) > 80 then '…' else '' end || '”'
  from public.profiles p
  where public.prayer_on_list(p.id, l) and p.id <> uid and p.id <> r.author_id;
end;
$$;

create or replace function public.prayer_list_remove(list_id uuid, request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.prayer_may_run_lists(auth.uid()) then
    raise exception 'You cannot run prayer lists.' using errcode = '42501';
  end if;
  delete from public.prayer_list_items i where i.list_id = prayer_list_remove.list_id and i.request_id = prayer_list_remove.request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Being told
-- ---------------------------------------------------------------------------

/** "“For my mother’s surgery on Thurs…”" — the first words, for a notification. */
create or replace function public.prayer_snippet(body text)
returns text
language sql
immutable
as $$
  select '“' || left(btrim(body), 80) || case when length(btrim(body)) > 80 then '…' else '' end || '”';
$$;

create or replace function public.prayer_tell()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.prayer_requests%rowtype;
begin
  if tg_table_name = 'prayer_requests' then
    r := new;
    if tg_op = 'INSERT' and r.kind = 'private' then
      -- A private request: the pastors, by name, since they see it anyway.
      insert into public.notifications (user_id, type, reference_id, body)
      select p.id, 'prayer_private', r.id,
        'A private prayer request from '
          || coalesce(nullif((select btrim(first_name || ' ' || last_name) from public.profiles where id = r.author_id), ''), 'somebody')
      from public.profiles p
      where p.id <> r.author_id and public.prayer_pastoral(p.id);
    elsif tg_op = 'UPDATE' and new.status = 'answered' and old.status <> 'answered' then
      -- Answered: whoever was still praying or fasting for it.
      insert into public.notifications (user_id, type, reference_id, body)
      select x.user_id, 'prayer_answered', r.id, 'A prayer answered — praise God! ' || public.prayer_snippet(r.body)
      from public.prayer_responses x
      where x.request_id = r.id and x.kind in ('praying', 'fasting') and x.user_id <> r.author_id
        -- Once: undoing and answering again does not tell them twice.
        and not exists (
          select 1 from public.notifications n
          where n.user_id = x.user_id and n.type = 'prayer_answered' and n.reference_id = r.id
        );
    end if;
  elsif tg_table_name = 'prayer_updates' then
    select * into r from public.prayer_requests where id = new.request_id;
    insert into public.notifications (user_id, type, reference_id, body)
    select x.user_id, 'prayer_update', r.id, 'An update on ' || public.prayer_snippet(r.body) || ': ' || left(new.body, 120)
    from public.prayer_responses x
    where x.request_id = r.id and x.kind in ('praying', 'fasting') and x.user_id <> r.author_id;
  end if;
  return null;
end;
$$;

drop trigger if exists prayer_requests_tell on public.prayer_requests;
create trigger prayer_requests_tell
  after insert or update of status on public.prayer_requests
  for each row execute function public.prayer_tell();

drop trigger if exists prayer_updates_tell on public.prayer_updates;
create trigger prayer_updates_tell
  after insert on public.prayer_updates
  for each row execute function public.prayer_tell();

-- ---------------------------------------------------------------------------
-- Grants, and the helpers kept off the API
-- ---------------------------------------------------------------------------

revoke all on function public.in_audience(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.prayer_may_assign(uuid) from public, anon, authenticated;
revoke all on function public.prayer_may_run_lists(uuid) from public, anon, authenticated;
revoke all on function public.prayer_on_list(uuid, public.prayer_lists) from public, anon, authenticated;
revoke all on function public.prayer_may_see(uuid, public.prayer_requests) from public, anon, authenticated;
revoke all on function public.prayer_names_author(uuid, public.prayer_requests) from public, anon, authenticated;
revoke all on function public.prayer_snippet(text) from public, anon, authenticated;
revoke all on function public.prayer_tell() from public, anon, authenticated;
revoke all on function public.prayer_board() from public, anon;
grant execute on function public.prayer_board() to authenticated;
revoke all on function public.prayer_assign(uuid, uuid[], boolean, text) from public, anon;
grant execute on function public.prayer_assign(uuid, uuid[], boolean, text) to authenticated;
revoke all on function public.prayer_unassign(uuid, uuid) from public, anon;
grant execute on function public.prayer_unassign(uuid, uuid) to authenticated;
revoke all on function public.prayer_list_save(uuid, text, jsonb) from public, anon;
grant execute on function public.prayer_list_save(uuid, text, jsonb) to authenticated;
revoke all on function public.prayer_list_delete(uuid) from public, anon;
grant execute on function public.prayer_list_delete(uuid) to authenticated;
revoke all on function public.prayer_list_add(uuid, uuid, boolean) from public, anon;
grant execute on function public.prayer_list_add(uuid, uuid, boolean) to authenticated;
revoke all on function public.prayer_list_remove(uuid, uuid) from public, anon;
grant execute on function public.prayer_list_remove(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
