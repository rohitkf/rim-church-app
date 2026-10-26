/*
 * Clock in, part 1: where the church is, the settings, and the tables.
 *
 * On the day of a service, whoever is on the rota presses CLOCK IN when
 * they arrive. Their phone reads where it is, once, and the database
 * decides whether that is at church. This migration lays the ground; the
 * function that clocks somebody in arrives with the next one.
 *
 *  - clock_in_place: the one spot the church meets, with the address it
 *    was found by. An Owner's or Admin's alone, to read and to change —
 *    the clock-in check reads it on their behalf.
 *
 *  - app_settings: how early clock-in opens before somebody's call time
 *    (and their reminder goes out), how near is near enough, how rough a
 *    reading may be, whether people who said Yes but have no role clock
 *    in too, who besides Admins and Overwatch may see the Clock In page,
 *    which teams may approve a request, and how long clock-ins are kept.
 *
 *  - clock_ins: one row per person per day. Where the phone was, how sure
 *    it was, how far from church, and the street address it was at. No
 *    one writes it directly; the functions to come do.
 *
 *  - clock_in_history: every clock-in, correction, addition and removal,
 *    kept beside it and cleared with it.
 */

-- ---------------------------------------------------------------------------
-- Who may run it, and who may see it
-- ---------------------------------------------------------------------------

/** The Owner or an Admin: who sets the church's spot and corrects the times. */
create or replace function public.clock_in_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or exists (select 1 from public.app_owner o where o.user_id = uid)
  );
$$;

-- ---------------------------------------------------------------------------
-- The settings
-- ---------------------------------------------------------------------------

/** People and teams, by id: who else may see the Clock In page. */
create or replace function public.clock_in_audience_is_valid(audience jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(audience) = 'object'
    and pg_column_size(audience) <= 16384
    and not exists (select 1 from jsonb_object_keys(audience) k where k not in ('teams', 'people'))
    and not exists (
      select 1
      from jsonb_each(audience) g(kind, ids)
      where jsonb_typeof(g.ids) <> 'array'
         or exists (
           select 1 from jsonb_array_elements(g.ids) i
           where jsonb_typeof(i) <> 'string'
              or i #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         )
    );
$$;

alter table public.app_settings
  -- Minutes before somebody's earliest call time that the CLOCK IN button
  -- appears and their reminder is sent: one setting, so the two agree.
  add column if not exists clock_in_lead_minutes integer not null default 5
    check (clock_in_lead_minutes between 0 and 240),
  -- How near counts as at church, in metres.
  add column if not exists clock_in_radius_m integer not null default 100
    check (clock_in_radius_m between 20 and 2000),
  -- How rough a reading may be and still count, in metres either way.
  add column if not exists clock_in_accuracy_m integer not null default 50
    check (clock_in_accuracy_m between 5 and 1000),
  -- Whether people who said Yes but have no role clock in as well.
  add column if not exists clock_in_include_yes boolean not null default false,
  -- Who else may open the Clock In page: whole teams, or named people.
  add column if not exists clock_in_viewers jsonb not null default '{"teams": [], "people": []}'::jsonb,
  -- Which teams may approve a request to be clocked in (Owner and Admins always may).
  add column if not exists clock_in_approver_teams jsonb not null default '[]'::jsonb,
  -- In those teams: their Heads and Assisting Heads, or anybody on them.
  add column if not exists clock_in_approvers text not null default 'leads'
    check (clock_in_approvers in ('leads', 'members')),
  -- Days a clock-in, its position, address and history are kept.
  add column if not exists clock_in_retention_days integer not null default 30
    check (clock_in_retention_days between 1 and 365);

alter table public.app_settings drop constraint if exists app_settings_clock_in_viewers_valid;
alter table public.app_settings
  add constraint app_settings_clock_in_viewers_valid check (public.clock_in_audience_is_valid(clock_in_viewers));

alter table public.app_settings drop constraint if exists app_settings_clock_in_approver_teams_valid;
alter table public.app_settings
  add constraint app_settings_clock_in_approver_teams_valid check (
    public.clock_in_audience_is_valid(jsonb_build_object('teams', clock_in_approver_teams))
  );

/**
 * Who may open the Clock In page and read what is on it.
 *
 * The Owner and Admins; Overwatch, unless the church closed the page to
 * it (Settings › Overwatch); and the people and teams named in Settings ›
 * Clock in — everybody on a named team, its Heads included.
 */
create or replace function public.may_see_clock_ins(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.clock_in_admin(uid)
    or public.overwatch_sees(uid, 'clock-in')
    or exists (
      select 1 from public.app_settings s
      where s.clock_in_viewers -> 'people' ? uid::text
         or exists (
           select 1 from jsonb_array_elements_text(s.clock_in_viewers -> 'teams') t(id)
           where public.is_dept_member(uid, t.id::uuid)
              or public.is_dept_head(uid, t.id::uuid)
         )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Where the church is
-- ---------------------------------------------------------------------------

create table if not exists public.clock_in_place (
  id boolean primary key default true check (id),
  -- What it was found by — an address or a postcode — and shown as.
  label text check (label is null or char_length(label) <= 300),
  postcode text check (postcode is null or char_length(postcode) <= 16),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.clock_in_place enable row level security;

drop policy if exists clock_in_place_admin on public.clock_in_place;
create policy clock_in_place_admin on public.clock_in_place
  for all
  using (public.clock_in_admin(auth.uid()))
  with check (public.clock_in_admin(auth.uid()));

create or replace function public.clock_in_place_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := (select p.id from public.profiles p where p.id = auth.uid());
  return new;
end;
$$;

drop trigger if exists clock_in_place_stamp on public.clock_in_place;
create trigger clock_in_place_stamp
  before insert or update on public.clock_in_place
  for each row execute function public.clock_in_place_stamp();

-- ---------------------------------------------------------------------------
-- Clock-ins, and their history
-- ---------------------------------------------------------------------------

create table if not exists public.clock_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The church's day it belongs to (its own timezone), not the UTC one.
  on_date date not null,
  clocked_at timestamptz not null,
  -- How it came to be: the phone at church, a request somebody approved,
  -- or an Owner or Admin adding it.
  method text not null check (method in ('location', 'request', 'added')),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  distance_m real check (distance_m is null or distance_m >= 0),
  -- The street address the position was at, looked up once.
  address text check (address is null or char_length(address) <= 500),
  address_looked_up_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (user_id, on_date)
);

create index if not exists clock_ins_on_date on public.clock_ins (on_date);

alter table public.clock_ins enable row level security;

-- Read by whoever may see the page, and by each person for their own day
-- (so their Dashboard knows they have clocked in). Written only by the
-- functions that clock somebody in or correct it.
drop policy if exists clock_ins_select on public.clock_ins;
create policy clock_ins_select on public.clock_ins
  for select using (user_id = auth.uid() or public.may_see_clock_ins(auth.uid()));

create table if not exists public.clock_in_history (
  id uuid primary key default gen_random_uuid(),
  -- By person and day rather than by row: a removal is kept after the row
  -- it removed has gone.
  user_id uuid not null references public.profiles(id) on delete cascade,
  on_date date not null,
  kind text not null check (kind in ('clocked_in', 'approved', 'added', 'changed', 'removed')),
  clocked_at timestamptz,
  previous_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists clock_in_history_day on public.clock_in_history (on_date, user_id);

alter table public.clock_in_history enable row level security;

drop policy if exists clock_in_history_select on public.clock_in_history;
create policy clock_in_history_select on public.clock_in_history
  for select using (public.may_see_clock_ins(auth.uid()));

/*
 * The history writes itself. Whatever function makes the change says
 * what kind it is, and why, for the one statement: `rim.clock_in_kind`
 * and `rim.clock_in_note`. A change with no kind is a correction.
 */
create or replace function public.clock_in_history_from_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  given text := nullif(current_setting('rim.clock_in_kind', true), '');
  why text := nullif(current_setting('rim.clock_in_note', true), '');
  by_whom uuid := (select p.id from public.profiles p where p.id = auth.uid());
begin
  -- Kept-for-so-long running out is not a change worth a line.
  if given = 'expired' then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.clock_in_history (user_id, on_date, kind, clocked_at, note, changed_by)
    values (
      new.user_id, new.on_date,
      coalesce(given, case new.method when 'location' then 'clocked_in' when 'request' then 'approved' else 'added' end),
      new.clocked_at, why, by_whom
    );
  elsif tg_op = 'UPDATE' then
    if new.clocked_at is distinct from old.clocked_at then
      insert into public.clock_in_history (user_id, on_date, kind, clocked_at, previous_at, note, changed_by)
      values (new.user_id, new.on_date, 'changed', new.clocked_at, old.clocked_at, why, by_whom);
    end if;
  elsif tg_op = 'DELETE' then
    -- The person is being deleted, and the row with them: the line would
    -- be refused by its foreign key, and would go a moment later anyway.
    if exists (select 1 from public.profiles p where p.id = old.user_id) then
      insert into public.clock_in_history (user_id, on_date, kind, previous_at, note, changed_by)
      values (old.user_id, old.on_date, 'removed', old.clocked_at, why, by_whom);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists clock_in_history on public.clock_ins;
create trigger clock_in_history
  after insert or update or delete on public.clock_ins
  for each row execute function public.clock_in_history_from_row();

-- ---------------------------------------------------------------------------
-- Kept for as long as the church says, then gone — history and all
-- ---------------------------------------------------------------------------

create or replace function public.delete_old_clock_ins()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep integer := coalesce((select clock_in_retention_days from public.app_settings limit 1), 30);
  today date := (now() at time zone public.church_timezone())::date;
begin
  -- The rows' own removals are not history worth keeping: the whole day
  -- is going.
  perform set_config('rim.clock_in_kind', 'expired', true);
  delete from public.clock_ins where on_date < today - keep;
  delete from public.clock_in_history where on_date < today - keep;
  perform set_config('rim.clock_in_kind', '', true);
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'delete-old-clock-ins';
    perform cron.schedule('delete-old-clock-ins', '50 2 * * *', 'select public.delete_old_clock_ins();');
  end if;
end $cron$;

-- ---------------------------------------------------------------------------
-- Grants, and the helpers kept off the API
-- ---------------------------------------------------------------------------

revoke all on function public.clock_in_admin(uuid) from public, anon;
grant execute on function public.clock_in_admin(uuid) to authenticated;
revoke all on function public.may_see_clock_ins(uuid) from public, anon;
grant execute on function public.may_see_clock_ins(uuid) to authenticated;
revoke all on function public.clock_in_history_from_row() from public, anon, authenticated;
revoke all on function public.clock_in_place_stamp() from public, anon, authenticated;
revoke all on function public.delete_old_clock_ins() from public, anon, authenticated;

grant select, insert, update, delete on public.clock_in_place to authenticated;
grant select on public.clock_ins to authenticated;
grant select on public.clock_in_history to authenticated;

-- 0175's hook: the database's own helpers are not the app's to call by
-- name. Unchanged but for the two added here.
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
    'overwatch_may_write_debrief', 'clock_in_admin', 'may_see_clock_ins'
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
