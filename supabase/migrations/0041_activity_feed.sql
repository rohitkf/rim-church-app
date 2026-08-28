-- ============================================================================
-- Live activity
-- ============================================================================
-- The dashboard had a "Live activity" panel that only ever showed checklist
-- verifications, which is a small slice of what actually happens on a
-- Sunday. This records the rest of it: who said they can serve, who turned
-- up, who was put on the rota, what changed in the running order, what got
-- ticked, what was posted.
--
-- Three decisions worth stating.
--
-- **Rows are written by triggers, never by the client.** An activity feed
-- the app writes to is a feed the app can lie in; one the database writes
-- from the rows themselves cannot disagree with what happened.
--
-- **Everything is pinned to a service.** "Live activity" during a service
-- means activity for *that* service; a feed mixing three Sundays is a log,
-- not a dashboard. A message board post has no service of its own, so it is
-- attached to the nearest upcoming one, which is what a post is about.
--
-- **It clears every Tuesday, like the board.** Same reasoning: this is a
-- rolling picture of the service in front of you, not an archive. Admins can
-- also clear it by hand.

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  -- Null when the actor's account is deleted, or when the row was written by
  -- something with no person behind it.
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,
  -- What it happened to: a role, a session, a team.
  subject text,
  -- How: 'available', 'signed off', 'turned up'.
  detail text,
  created_at timestamptz not null default now()
);

alter table public.activity enable row level security;

create index if not exists activity_service_idx on public.activity (service_id, created_at desc);

-- The feed is the church's shared picture of its own service, so anyone
-- signed in may read it. Writing is triggers only: no insert or update
-- policy exists, which is what makes the feed trustworthy.
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select using (auth.uid() is not null);

drop policy if exists activity_delete on public.activity;
create policy activity_delete on public.activity
  for delete using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Writing it
-- ---------------------------------------------------------------------------

create or replace function public.record_activity(
  svc uuid,
  dept uuid,
  actor uuid,
  kind text,
  subject text default null,
  detail text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.activity (service_id, department_id, actor_id, kind, subject, detail)
  select svc, dept, actor, kind, subject, detail
  where svc is not null;
$$;

/** Who can serve, and who turned up — two different events on one table. */
create or replace function public.activity_from_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team text;
begin
  select name into team from public.departments where id = new.department_id;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    perform public.record_activity(
      new.service_id, new.department_id, new.user_id, 'availability', team, new.status::text
    );
  end if;

  if new.attended is distinct from coalesce(old.attended, null) and new.attended is not null then
    perform public.record_activity(
      new.service_id, new.department_id, new.user_id, 'attendance', team,
      case when new.attended then 'turned up' else 'did not turn up' end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists activity_availability on public.availability;
create trigger activity_availability
  after insert or update on public.availability
  for each row execute function public.activity_from_availability();

/** The running order changing under people who are about to run it. */
create or replace function public.activity_from_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.record_activity(
      old.service_id, old.department_id, auth.uid(), 'planner', old.session_name, 'removed'
    );
    return old;
  end if;

  perform public.record_activity(
    new.service_id, new.department_id, auth.uid(), 'planner', new.session_name,
    case when tg_op = 'INSERT' then 'added' else 'changed' end
  );
  return new;
end;
$$;

drop trigger if exists activity_session on public.service_sessions;
create trigger activity_session
  after insert or update or delete on public.service_sessions
  for each row execute function public.activity_from_session();

/** A checklist item moving a stage. */
create or replace function public.activity_from_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  item_label text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  select service_id, department_id, role_label into a
  from public.rota_assignments where id = new.assignment_id;
  select label into item_label
  from public.department_role_checklist_items where id = new.item_id;

  perform public.record_activity(
    a.service_id, a.department_id, auth.uid(), 'checklist',
    coalesce(item_label, a.role_label),
    case new.status
      when 'member_complete' then 'ticked'
      when 'head_verified' then 'verified'
      when 'coordinator_verified' then 'signed off'
      else new.status::text
    end
  );
  return new;
end;
$$;

drop trigger if exists activity_checklist on public.rota_checklist_progress;
create trigger activity_checklist
  after insert or update on public.rota_checklist_progress
  for each row execute function public.activity_from_checklist();

/** Someone put on a role, or taken off one. */
create or replace function public.activity_from_rota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  if tg_op = 'DELETE' then
    select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
      into who from public.profiles where id = old.user_id;
    perform public.record_activity(
      old.service_id, old.department_id, auth.uid(), 'rota',
      old.role_label, coalesce(nullif(who, ''), 'someone') || ' taken off'
    );
    return old;
  end if;

  select btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    into who from public.profiles where id = new.user_id;
  perform public.record_activity(
    new.service_id, new.department_id, auth.uid(), 'rota',
    new.role_label, coalesce(nullif(who, ''), 'someone') || ' assigned'
  );
  return new;
end;
$$;

drop trigger if exists activity_rota on public.rota_assignments;
create trigger activity_rota
  after insert or update or delete on public.rota_assignments
  for each row execute function public.activity_from_rota();

/**
 * A board post.
 *
 * The board is not per-service, so the post is filed against the service it
 * is really about: the next one coming up, or the most recent if there is
 * nothing ahead.
 */
create or replace function public.activity_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  svc uuid;
  team text;
begin
  select id into svc from public.services
  where date >= current_date order by date asc limit 1;
  if svc is null then
    select id into svc from public.services order by date desc limit 1;
  end if;

  select name into team from public.departments where id = new.department_id;

  perform public.record_activity(
    svc, new.department_id, new.author_id, 'message', coalesce(team, 'the board'), 'posted'
  );
  return new;
end;
$$;

drop trigger if exists activity_message on public.messages;
create trigger activity_message
  after insert on public.messages
  for each row execute function public.activity_from_message();

-- ---------------------------------------------------------------------------
-- Clearing it
-- ---------------------------------------------------------------------------

/** The Admin-only "clear" — for everyone, not just the Admin pressing it. */
create or replace function public.clear_activity(svc uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can clear the activity feed.';
  end if;
  delete from public.activity
  where (svc is null and activity.ctid is not null) or service_id = svc;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.clear_activity(uuid) to authenticated;
  end if;
end $$;

-- Every Tuesday, with the board: this is a rolling picture, not an archive.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('rim-clear-activity')
      where exists (select 1 from cron.job where jobname = 'rim-clear-activity');
    perform cron.schedule(
      'rim-clear-activity',
      '0 0 * * 2',
      $cron$delete from public.activity where activity.ctid is not null;$cron$
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- And make it actually live
-- ---------------------------------------------------------------------------
-- Without this the panel is a feed that only updates when you reload it,
-- which is exactly what it is not supposed to be.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity'
  ) then
    alter publication supabase_realtime add table public.activity;
  end if;
end $$;
