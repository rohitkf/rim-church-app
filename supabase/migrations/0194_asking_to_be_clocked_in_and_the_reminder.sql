/*
 * Clock in, part 3: asking to be clocked in, the reminder, and who is
 * still to arrive (0191, 0192, 0193).
 *
 * A phone that will not place itself at church — indoors, a weak signal,
 * location blocked — should not cost somebody their Present. After a
 * failed CLOCK IN they can ask instead. The request keeps the best reading
 * the phone gave on that attempt, if it gave one, so whoever approves can
 * see where the phone thought it was before saying yes; and once approved
 * the clock-in keeps that reading too, so the record says where they were.
 *
 * Who approves is the church's choice (Settings › Clock in): the Owner and
 * Admins always, and the teams named there — their Head and Assisting
 * Head, or anybody on them. Nobody approves their own. Approved, the
 * clock-in is at the time they asked, not the time it was approved.
 *
 * The reminder goes once, at the moment clocking in opens for that person
 * — the same minutes before their first call as the button.
 */

-- ---------------------------------------------------------------------------
-- Who approves
-- ---------------------------------------------------------------------------

create or replace function public.may_approve_clock_ins(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.clock_in_admin(uid)
    or exists (
      select 1
      from public.app_settings s
      cross join lateral jsonb_array_elements_text(coalesce(s.clock_in_approver_teams, '[]'::jsonb)) t(id)
      where t.id ~ '^[0-9a-f-]{36}$'
        and (
          public.is_dept_head_or_assisting(uid, t.id::uuid)
          or (s.clock_in_approvers = 'members' and public.is_dept_member(uid, t.id::uuid))
        )
    )
  );
$$;

/** Everybody who may approve, for telling them a request is waiting. */
create or replace function public.clock_in_approver_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p where public.may_approve_clock_ins(p.id);
$$;

-- ---------------------------------------------------------------------------
-- Everybody's duties on a day, at once
-- ---------------------------------------------------------------------------

/*
 * The same duties as clock_in_duties(), for the whole church on one day:
 * what the reminder and the "still to arrive" list are made of.
 */
create or replace function public.clock_in_day_duties(on_day date)
returns table (user_id uuid, service_id uuid, department_id uuid, call_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.user_id, r.service_id, r.department_id
    from public.rota_assignments r
    join public.services s on s.id = r.service_id
    where s.date = on_day and r.user_id is not null
    union
    select a.user_id, a.service_id, a.department_id
    from public.availability a
    join public.services s on s.id = a.service_id
    where s.date = on_day
      and a.status = 'available'
      and coalesce((select clock_in_include_yes from public.app_settings limit 1), false)
  )
  select m.user_id, m.service_id, m.department_id,
    ((on_day + coalesce(ct.call_time, time '07:00')) at time zone public.church_timezone()) as call_at
  from mine m
  left join public.department_call_times ct
    on ct.department_id = m.department_id and ct.on_date = on_day;
$$;

-- ---------------------------------------------------------------------------
-- The requests
-- ---------------------------------------------------------------------------

create table if not exists public.clock_in_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  on_date date not null,
  -- The clock-in's time, once approved.
  asked_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 500),
  -- What the phone said on the failed attempt. All empty when it gave
  -- nothing at all.
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  distance_m double precision,
  read_at timestamptz,
  -- Why the phone was not enough: too_rough, too_far, blocked, nothing.
  failed_because text check (failed_because is null or failed_because in ('too_rough', 'too_far', 'blocked', 'nothing')),
  address text,
  address_looked_up_at timestamptz,
  address_tried_at timestamptz,
  address_tries smallint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

-- One a day — a cancelled one does not count, so they can ask again.
create unique index if not exists clock_in_requests_one_a_day
  on public.clock_in_requests (user_id, on_date) where status <> 'cancelled';
create index if not exists clock_in_requests_pending on public.clock_in_requests (on_date) where status = 'pending';

alter table public.clock_in_requests enable row level security;

drop policy if exists clock_in_requests_read on public.clock_in_requests;
create policy clock_in_requests_read on public.clock_in_requests
  for select to authenticated
  using (user_id = auth.uid() or public.may_approve_clock_ins(auth.uid()));

grant select on public.clock_in_requests to authenticated;

/**
 * What the Dashboard needs about today for the signed-in person — as
 * 0192's, with their request, if they made one.
 */
create or replace function public.my_clock_in_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := public.church_today();
  first_call timestamptz;
  lead integer := coalesce((select clock_in_lead_minutes from public.app_settings limit 1), 5);
  done public.clock_ins%rowtype;
  asked public.clock_in_requests%rowtype;
begin
  if uid is null then return jsonb_build_object('due', false); end if;
  select min(d.call_at) into first_call from public.clock_in_duties(uid, today) d;
  select * into done from public.clock_ins c where c.user_id = uid and c.on_date = today;
  select * into asked from public.clock_in_requests r
  where r.user_id = uid and r.on_date = today and r.status <> 'cancelled';
  return jsonb_build_object(
    'due', first_call is not null,
    'on_date', today,
    'first_call', first_call,
    'opens_at', first_call - make_interval(mins => lead),
    'closes_at', public.clock_in_day_ends(today),
    'place_set', exists (select 1 from public.clock_in_place),
    'accuracy_m', coalesce((select clock_in_accuracy_m from public.app_settings limit 1), 50),
    'radius_m', coalesce((select clock_in_radius_m from public.app_settings limit 1), 100),
    'clocked_at', done.clocked_at,
    'method', done.method,
    'request', case when asked.id is null then null else jsonb_build_object(
      'id', asked.id,
      'status', asked.status,
      'asked_at', asked.asked_at,
      'decision_note', asked.decision_note
    ) end
  );
end;
$$;

/**
 * Ask to be clocked in, with whatever the phone gave on the attempt.
 * Only while clocking in is open for them, only when they have not, and
 * once a day.
 */
create or replace function public.clock_in_ask(
  lat double precision default null,
  lng double precision default null,
  accuracy double precision default null,
  read_at timestamptz default null,
  failed_because text default null,
  note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := public.church_today();
  first_call timestamptz;
  place public.clock_in_place%rowtype;
  away double precision;
  made uuid;
  who text;
  says text;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if (lat is null) <> (lng is null)
     or (lat is not null and (lat not between -90 and 90 or lng not between -180 and 180)) then
    raise exception 'That is not a position';
  end if;
  if exists (select 1 from public.clock_ins where user_id = uid and on_date = today) then
    raise exception 'You have already clocked in today.';
  end if;
  select min(d.call_at) into first_call from public.clock_in_duties(uid, today) d;
  if first_call is null then raise exception 'You are not on today''s rota.'; end if;
  if now() < first_call - make_interval(mins => coalesce((select clock_in_lead_minutes from public.app_settings limit 1), 5)) then
    raise exception 'Clocking in is not open yet.';
  end if;
  if now() >= public.clock_in_day_ends(today) then
    raise exception 'Clocking in has closed for today.';
  end if;
  if exists (select 1 from public.clock_in_requests where user_id = uid and on_date = today and status <> 'cancelled') then
    raise exception 'You have already asked today.';
  end if;

  select * into place from public.clock_in_place limit 1;
  if found and lat is not null then
    away := public.metres_between(place.latitude, place.longitude, lat, lng);
  end if;

  insert into public.clock_in_requests (
    user_id, on_date, note, latitude, longitude, accuracy_m, distance_m, read_at, failed_because
  )
  values (
    uid, today, left(nullif(btrim(coalesce(note, '')), ''), 500), lat, lng,
    case when lat is null then null else accuracy end, away,
    case when lat is null then null else coalesce(read_at, now()) end,
    case when failed_because in ('too_rough', 'too_far', 'blocked', 'nothing') then failed_because end
  )
  returning id into made;

  select btrim(first_name || ' ' || last_name) into who from public.profiles where id = uid;
  says := coalesce(nullif(who, ''), 'Somebody') || ' asks to be clocked in at '
    || to_char(now() at time zone public.church_timezone(), 'HH24:MI')
    || case
         when lat is null then ' — their phone gave no location.'
         when away is null then '.'
         when away < 1000 then ' — ' || round(away)::text || ' m from church.'
         else ' — ' || to_char(away / 1000, 'FM990.0') || ' km from church.'
       end;
  insert into public.notifications (user_id, type, reference_id, body)
  select a, 'clock_in_request', made, says
  from public.clock_in_approver_ids() a
  where a <> uid;
  return made;
end;
$$;

create or replace function public.clock_in_cancel_ask(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clock_in_requests
  set status = 'cancelled', decided_at = now(), decided_by = auth.uid()
  where id = request_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'That request is not waiting any more.'; end if;
  update public.notifications set read_boolean = true
  where type = 'clock_in_request' and reference_id = request_id;
end;
$$;

/**
 * Yes or no. Yes clocks them in at the time they asked, with the reading
 * they had, and marks them Present as a clock-in would; either way they
 * are told, and the others who could have answered are not left with it.
 */
create or replace function public.clock_in_decide(request_id uuid, approve boolean, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  asked public.clock_in_requests%rowtype;
  why text := left(nullif(btrim(coalesce(note, '')), ''), 500);
  by_name text;
begin
  if not public.may_approve_clock_ins(me) then
    raise exception 'You cannot answer clock-in requests.' using errcode = '42501';
  end if;
  select * into asked from public.clock_in_requests where id = request_id for update;
  if not found or asked.status <> 'pending' then raise exception 'That request is not waiting any more.'; end if;
  if asked.user_id = me then raise exception 'Somebody else has to answer your own request.'; end if;
  if approve is null then raise exception 'Say yes or no.'; end if;

  update public.clock_in_requests
  set status = case when approve then 'approved' else 'declined' end,
      decided_by = me, decided_at = now(), decision_note = why
  where id = request_id;

  if approve then
    if exists (select 1 from public.clock_ins where user_id = asked.user_id and on_date = asked.on_date) then
      raise exception 'They have already clocked in that day.';
    end if;
    perform set_config('rim.clock_in_note', coalesce(why, ''), true);
    insert into public.clock_ins (
      user_id, on_date, clocked_at, method, latitude, longitude, accuracy_m, distance_m,
      address, address_looked_up_at, created_by
    )
    values (
      asked.user_id, asked.on_date, asked.asked_at, 'request', asked.latitude, asked.longitude,
      asked.accuracy_m, asked.distance_m, asked.address, asked.address_looked_up_at, me
    );
    perform set_config('rim.clock_in_note', '', true);
    perform public.clock_in_mark_present(asked.user_id, asked.on_date);
  end if;

  update public.notifications set read_boolean = true
  where type = 'clock_in_request' and reference_id = request_id;

  select btrim(first_name || ' ' || last_name) into by_name from public.profiles where id = me;
  insert into public.notifications (user_id, type, reference_id, body)
  values (
    asked.user_id, 'clock_in_decided', request_id,
    case when approve
      then 'You are clocked in at ' || to_char(asked.asked_at at time zone public.church_timezone(), 'HH24:MI')
           || ' — approved by ' || coalesce(nullif(by_name, ''), 'an approver') || '.'
      else 'Your request to be clocked in was declined by ' || coalesce(nullif(by_name, ''), 'an approver')
           || coalesce(': ' || why, '.')
    end
  );
end;
$$;

/*
 * Clocked in another way — their phone on a second try, or an Admin adding
 * it — and a request that was waiting has nothing left to ask for.
 */
create or replace function public.clock_in_closes_its_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clock_in_requests
  set status = 'cancelled', decided_at = now(), decided_by = new.created_by
  where user_id = new.user_id and on_date = new.on_date and status = 'pending';
  if found then
    update public.notifications n set read_boolean = true
    from public.clock_in_requests r
    where n.type = 'clock_in_request' and n.reference_id = r.id
      and r.user_id = new.user_id and r.on_date = new.on_date;
  end if;
  return null;
end;
$$;

drop trigger if exists clock_in_closes_its_request on public.clock_ins;
create trigger clock_in_closes_its_request
  after insert on public.clock_ins
  for each row execute function public.clock_in_closes_its_request();

-- ---------------------------------------------------------------------------
-- The address queue takes requests too
-- ---------------------------------------------------------------------------

/*
 * An approver wants the street before saying yes, so a request's reading
 * is looked up as a clock-in's is — through the same queue, one a second,
 * by the same `clock-in-address` function, which needs no change: ids are
 * unique across both tables, and setting the address finds whichever it is.
 */
create or replace function public.next_clock_in_address()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  found_id uuid;
  found_lat double precision;
  found_lng double precision;
  from_requests boolean := false;
  waited double precision;
begin
  select c.id, c.latitude, c.longitude into found_id, found_lat, found_lng
  from public.clock_ins c
  where c.address is null and c.latitude is not null and c.address_tries < 3
    and (c.address_tried_at is null or c.address_tried_at < now() - interval '2 minutes')
  order by c.created_at
  limit 1
  for update skip locked;
  if found_id is null then
    select r.id, r.latitude, r.longitude into found_id, found_lat, found_lng
    from public.clock_in_requests r
    where r.address is null and r.latitude is not null and r.address_tries < 3
      and (r.address_tried_at is null or r.address_tried_at < now() - interval '2 minutes')
    order by r.created_at
    limit 1
    for update skip locked;
    from_requests := found_id is not null;
  end if;
  if found_id is null then return null; end if;

  update public.clock_in_geocoder set last_at = clock_timestamp()
  where last_at < clock_timestamp() - interval '1100 milliseconds';
  if not found then
    select extract(epoch from (last_at + interval '1100 milliseconds' - clock_timestamp())) * 1000 into waited
    from public.clock_in_geocoder;
    return jsonb_build_object('wait_ms', greatest(100, ceil(waited)));
  end if;

  if from_requests then
    update public.clock_in_requests set address_tried_at = now(), address_tries = address_tries + 1 where id = found_id;
  else
    update public.clock_ins set address_tried_at = now(), address_tries = address_tries + 1 where id = found_id;
  end if;
  return jsonb_build_object('id', found_id, 'latitude', found_lat, 'longitude', found_lng);
end;
$$;

create or replace function public.set_clock_in_address(clock_in_id uuid, found_address text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  said text := left(nullif(btrim(found_address), ''), 500);
begin
  update public.clock_ins set address = said, address_looked_up_at = now() where id = clock_in_id;
  if found then return; end if;
  update public.clock_in_requests set address = said, address_looked_up_at = now() where id = clock_in_id;
  -- Approved before the street came back: the clock-in made from it
  -- carries the reading, and gets the street as well.
  update public.clock_ins c set address = said, address_looked_up_at = now()
  from public.clock_in_requests r
  where r.id = clock_in_id and r.status = 'approved'
    and c.user_id = r.user_id and c.on_date = r.on_date and c.method = 'request' and c.address is null
    and c.latitude = r.latitude and c.longitude = r.longitude;
end;
$$;

-- ---------------------------------------------------------------------------
-- The reminder
-- ---------------------------------------------------------------------------

create table if not exists public.clock_in_reminded (
  user_id uuid not null references public.profiles(id) on delete cascade,
  on_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, on_date)
);
alter table public.clock_in_reminded enable row level security;

/*
 * Once a minute: everybody whose clocking in has just opened, and who has
 * neither clocked in nor been told, is told. Only within the first half
 * hour of it opening, so a job that was down does not wake somebody at
 * lunchtime about a call at nine. Nothing at all until the church's spot
 * is set, since nobody could clock in.
 */
create or replace function public.send_clock_in_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.church_today();
  lead integer := coalesce((select clock_in_lead_minutes from public.app_settings limit 1), 5);
  sent integer;
begin
  if not exists (select 1 from public.clock_in_place) then return 0; end if;
  with due as (
    select d.user_id, min(d.call_at) as first_call
    from public.clock_in_day_duties(today) d
    group by d.user_id
  ),
  now_open as (
    select due.user_id, due.first_call from due
    where now() >= due.first_call - make_interval(mins => lead)
      and now() < due.first_call - make_interval(mins => lead) + interval '30 minutes'
      and now() < public.clock_in_day_ends(today)
      and not exists (select 1 from public.clock_ins c where c.user_id = due.user_id and c.on_date = today)
  ),
  marked as (
    insert into public.clock_in_reminded (user_id, on_date)
    select user_id, today from now_open
    on conflict do nothing
    returning user_id
  )
  insert into public.notifications (user_id, type, reference_id, body)
  select m.user_id, 'clock_in_reminder', null,
    'Clock in when you arrive — you are called for '
      || to_char(o.first_call at time zone public.church_timezone(), 'HH24:MI') || '.'
  from marked m join now_open o on o.user_id = m.user_id;
  get diagnostics sent = row_count;
  return sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who is still to arrive
-- ---------------------------------------------------------------------------

/**
 * Everybody on a day's rota (or a Yes, by the setting) who has not clocked
 * in, team by team, with their call time and whether they have asked —
 * for whoever may see the Clock In page.
 */
create or replace function public.clock_in_still_out(on_day date)
returns table (user_id uuid, department_id uuid, call_at timestamptz, asked boolean)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, d.department_id, min(d.call_at),
    exists (select 1 from public.clock_in_requests r
            where r.user_id = d.user_id and r.on_date = on_day and r.status = 'pending')
  from public.clock_in_day_duties(on_day) d
  where public.may_see_clock_ins(auth.uid())
    and not exists (select 1 from public.clock_ins c where c.user_id = d.user_id and c.on_date = on_day)
  group by d.user_id, d.department_id;
$$;

-- ---------------------------------------------------------------------------
-- Keeping, and the jobs
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
  delete from public.clock_in_requests where on_date < today - keep;
  delete from public.clock_in_reminded where on_date < today - 2;
  perform set_config('rim.clock_in_kind', '', true);
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'clock-in-reminders';
    perform cron.schedule('clock-in-reminders', '* * * * *', 'select public.send_clock_in_reminders()');
  end if;
end;
$cron$;

-- ---------------------------------------------------------------------------
-- Grants, and the helpers kept off the API
-- ---------------------------------------------------------------------------

revoke all on function public.may_approve_clock_ins(uuid) from public, anon;
grant execute on function public.may_approve_clock_ins(uuid) to authenticated;
revoke all on function public.clock_in_approver_ids() from public, anon, authenticated;
revoke all on function public.clock_in_day_duties(date) from public, anon, authenticated;
revoke all on function public.clock_in_closes_its_request() from public, anon, authenticated;
revoke all on function public.send_clock_in_reminders() from public, anon, authenticated;
revoke all on function public.delete_old_clock_ins() from public, anon, authenticated;
revoke all on function public.my_clock_in_today() from public, anon;
grant execute on function public.my_clock_in_today() to authenticated;
revoke all on function public.clock_in_ask(double precision, double precision, double precision, timestamptz, text, text) from public, anon;
grant execute on function public.clock_in_ask(double precision, double precision, double precision, timestamptz, text, text) to authenticated;
revoke all on function public.clock_in_cancel_ask(uuid) from public, anon;
grant execute on function public.clock_in_cancel_ask(uuid) to authenticated;
revoke all on function public.clock_in_decide(uuid, boolean, text) from public, anon;
grant execute on function public.clock_in_decide(uuid, boolean, text) to authenticated;
revoke all on function public.clock_in_still_out(date) from public, anon;
grant execute on function public.clock_in_still_out(date) to authenticated;
revoke all on function public.next_clock_in_address() from public, anon, authenticated;
grant execute on function public.next_clock_in_address() to service_role;
revoke all on function public.set_clock_in_address(uuid, text) from public, anon, authenticated;
grant execute on function public.set_clock_in_address(uuid, text) to service_role;

-- 0175's hook: the database's own helpers are not the app's to call by
-- name. Unchanged but for the one added here.
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
    'overwatch_may_write_debrief', 'clock_in_admin', 'may_see_clock_ins',
    'may_approve_clock_ins'
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
