/*
 * Clock in, part 2: clocking in at church, and putting it right.
 *
 * Whoever is on the day's rota — and, when the church says so, whoever
 * said Yes — presses CLOCK IN on their Dashboard when they arrive. Their
 * phone sends where it is and how sure it is, once. This decides:
 *
 *  - Is it their day? They are on the rota (or said Yes) for one of
 *    today's services, in the church's own timezone.
 *  - Is it open? From `clock_in_lead_minutes` before their earliest call
 *    time that day until the day's last service has ended.
 *  - Once a day. A second press is told it has already been done.
 *  - Is the reading good enough? Accurate to `clock_in_accuracy_m`, and
 *    within `clock_in_radius_m` of the church's spot — measured here, not
 *    taken from the phone.
 *
 * A clock-in marks them Present on Availability for every team the rota
 * has them on that day; a No or a Maybe becomes Yes, and the answer's
 * history says it was the clock-in. Heads can still change it.
 *
 * The Owner and Admins can then change a time, add a clock-in for
 * somebody whose phone could not, or remove one — every change in the
 * history, with a note if they give one.
 *
 * The street address of each position is looked up afterwards, once, by
 * the `clock-in-address` function: these hand it its queue, one row at a
 * time and never more than one a second, as OpenStreetMap asks.
 */

-- ---------------------------------------------------------------------------
-- Whose day it is, and when
-- ---------------------------------------------------------------------------

/** The church's date today, in its own timezone. */
create or replace function public.church_today()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone public.church_timezone())::date;
$$;

/**
 * Each team and service somebody is down for on a day, with the moment
 * that team is called in: the rota, and — when the church says so —
 * whoever said Yes. A team with no call time set that day is called at
 * seven, as everywhere else in the app.
 */
create or replace function public.clock_in_duties(uid uuid, on_day date)
returns table (service_id uuid, department_id uuid, call_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select r.service_id, r.department_id
    from public.rota_assignments r
    join public.services s on s.id = r.service_id
    where r.user_id = uid and s.date = on_day
    union
    select a.service_id, a.department_id
    from public.availability a
    join public.services s on s.id = a.service_id
    where a.user_id = uid
      and s.date = on_day
      and a.status = 'available'
      and coalesce((select clock_in_include_yes from public.app_settings limit 1), false)
  )
  select m.service_id, m.department_id,
    ((on_day + coalesce(ct.call_time, time '07:00')) at time zone public.church_timezone()) as call_at
  from mine m
  left join public.department_call_times ct
    on ct.department_id = m.department_id and ct.on_date = on_day;
$$;

/** When a day's last service ends: as ended, or as planned; the day's end if nothing says. */
create or replace function public.clock_in_day_ends(on_day date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select max(coalesce(
       s.ended_at,
       (select max(ss.start_time + make_interval(mins => coalesce(ss.duration_minutes, 0) + coalesce(ss.added_minutes, 0)))
        from public.service_sessions ss where ss.service_id = s.id)
     ))
     from public.services s where s.date = on_day),
    ((on_day + 1)::timestamp at time zone public.church_timezone())
  );
$$;

/**
 * The signed-in person's clock-in today: whether they are due, when it
 * opens and closes, and whether they have done it. What the Dashboard
 * draws the CLOCK IN button from — and what the reminder reads.
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
begin
  if uid is null then return jsonb_build_object('due', false); end if;
  select min(d.call_at) into first_call from public.clock_in_duties(uid, today) d;
  select * into done from public.clock_ins c where c.user_id = uid and c.on_date = today;
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
    'method', done.method
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Marking Present
-- ---------------------------------------------------------------------------

/*
 * The answer's history says when it was the clock-in that moved it, so a
 * No that became Yes does not read as the person changing their mind.
 */
alter table public.availability_history
  add column if not exists by_clock_in boolean not null default false;

create or replace function public.availability_history_from_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  row_now record := coalesce(new, old);
  what text;
  said_before text := case when tg_op = 'INSERT' then null else nullif(btrim(coalesce(old.note, '')), '') end;
  says_now text := case when tg_op = 'DELETE' then null else nullif(btrim(coalesce(new.note, '')), '') end;
begin
  if tg_op = 'INSERT' then
    what := 'answered';
  elsif tg_op = 'DELETE' then
    what := 'removed';
  elsif new.status is distinct from old.status then
    what := 'changed';
  elsif says_now is distinct from said_before then
    what := 'note';
  else
    return null;
  end if;

  insert into public.availability_history (
    user_id, service_id, department_id, kind, status, previous_status, note,
    changed_by, by_request, after_close, by_clock_in
  )
  select
    row_now.user_id,
    row_now.service_id,
    row_now.department_id,
    what,
    case when tg_op = 'DELETE' then null else new.status end,
    case when tg_op = 'INSERT' then null else old.status end,
    says_now,
    (select p.id from public.profiles p where p.id = auth.uid()),
    public.availability_write_is_approval(row_now.user_id, row_now.service_id, row_now.department_id),
    public.availability_is_closed(row_now.service_id),
    coalesce(current_setting('rim.clock_in', true), '') = '1'
  -- The service, team or person is being deleted, and the answer with it:
  -- the line would be refused by its foreign key, and would go a moment
  -- later anyway.
  where exists (select 1 from public.services s where s.id = row_now.service_id)
    and exists (select 1 from public.departments d where d.id = row_now.department_id)
    and exists (select 1 from public.profiles p where p.id = row_now.user_id);

  return null;
end;
$function$;

-- Present is a head's to mark (0176) — and a clock-in's, for the one write.
create or replace function public.availability_guard_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attended is distinct from old.attended
     and auth.uid() is not null
     and coalesce(current_setting('rim.clock_in', true), '') <> '1'
     and not public.may(auth.uid(), 'day.attendance', old.department_id, old.service_id) then
    raise exception 'Only whoever records attendance for this team can mark who came.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

/**
 * Present, for everything somebody is down for on a day. A No or a Maybe
 * becomes Yes; a service already finished is left as it is unless it
 * already said Yes, since its answers are locked (0047). Returns how many
 * answers were marked.
 */
create or replace function public.clock_in_mark_present(uid uuid, on_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  duty record;
  marked integer := 0;
begin
  perform set_config('rim.clock_in', '1', true);
  for duty in select distinct d.service_id, d.department_id from public.clock_in_duties(uid, on_day) d loop
    if public.service_has_finished(duty.service_id) then
      update public.availability set attended = true
      where user_id = uid and service_id = duty.service_id and department_id = duty.department_id
        and status = 'available' and attended is distinct from true;
    else
      insert into public.availability (user_id, service_id, department_id, status, attended)
      values (uid, duty.service_id, duty.department_id, 'available', true)
      on conflict (user_id, service_id, department_id)
      do update set status = 'available', attended = true
      where availability.status is distinct from 'available' or availability.attended is distinct from true;
    end if;
    if found then marked := marked + 1; end if;
  end loop;
  perform set_config('rim.clock_in', '', true);
  return marked;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clocking in
-- ---------------------------------------------------------------------------

/** Metres between two points on the Earth (haversine, the mean radius). */
create or replace function public.metres_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

/**
 * Clock in, from where the phone is.
 *
 * Returns what happened rather than raising, so the Dashboard can say it
 * in words: `{ ok: true, clocked_at, distance_m, marked }`, or
 * `{ ok: false, reason, … }` with reason one of not_due, not_yet, closed,
 * already, no_place, too_rough, too_far.
 */
create or replace function public.clock_in(lat double precision, lng double precision, accuracy double precision)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := public.church_today();
  s public.app_settings%rowtype;
  first_call timestamptz;
  opens timestamptz;
  closes timestamptz;
  place public.clock_in_place%rowtype;
  away double precision;
  done public.clock_ins%rowtype;
  marked integer;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    raise exception 'That is not a position';
  end if;
  select * into s from public.app_settings limit 1;

  select * into done from public.clock_ins c where c.user_id = uid and c.on_date = today;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already', 'clocked_at', done.clocked_at);
  end if;

  select min(d.call_at) into first_call from public.clock_in_duties(uid, today) d;
  if first_call is null then
    return jsonb_build_object('ok', false, 'reason', 'not_due');
  end if;
  opens := first_call - make_interval(mins => coalesce(s.clock_in_lead_minutes, 5));
  closes := public.clock_in_day_ends(today);
  if now() < opens then
    return jsonb_build_object('ok', false, 'reason', 'not_yet', 'opens_at', opens);
  end if;
  if now() >= closes then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  select * into place from public.clock_in_place limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_place');
  end if;

  if accuracy is null or accuracy < 0 or accuracy > coalesce(s.clock_in_accuracy_m, 50) then
    return jsonb_build_object('ok', false, 'reason', 'too_rough',
      'accuracy_m', round(accuracy::numeric), 'needed_m', coalesce(s.clock_in_accuracy_m, 50));
  end if;

  away := public.metres_between(place.latitude, place.longitude, lat, lng);
  if away > coalesce(s.clock_in_radius_m, 100) then
    return jsonb_build_object('ok', false, 'reason', 'too_far',
      'distance_m', round(away::numeric), 'radius_m', coalesce(s.clock_in_radius_m, 100));
  end if;

  insert into public.clock_ins (user_id, on_date, clocked_at, method, latitude, longitude, accuracy_m, distance_m, created_by)
  values (uid, today, now(), 'location', lat, lng, accuracy, away, uid)
  on conflict (user_id, on_date) do nothing
  returning * into done;
  if not found then
    -- Pressed twice at once: the other press won.
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;

  marked := public.clock_in_mark_present(uid, today);
  return jsonb_build_object('ok', true, 'clocked_at', done.clocked_at, 'distance_m', round(away::numeric), 'marked', marked);
end;
$$;

-- ---------------------------------------------------------------------------
-- Putting it right: the Owner's and Admins'
-- ---------------------------------------------------------------------------

create or replace function public.clock_in_set_time(clock_in_id uuid, new_at timestamptz, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.clock_ins%rowtype;
begin
  if not public.clock_in_admin(auth.uid()) then
    raise exception 'Only the Owner or an Admin can change a clock-in.' using errcode = '42501';
  end if;
  select * into row from public.clock_ins where id = clock_in_id;
  if not found then raise exception 'That clock-in has gone.'; end if;
  if new_at is null then raise exception 'Give the time it should say.'; end if;
  -- The time stays on the day it belongs to.
  if (new_at at time zone public.church_timezone())::date <> row.on_date then
    raise exception 'The time has to be on the day of the clock-in.';
  end if;
  perform set_config('rim.clock_in_note', left(nullif(btrim(coalesce(note, '')), ''), 500), true);
  update public.clock_ins set clocked_at = new_at where id = clock_in_id;
  perform set_config('rim.clock_in_note', '', true);
end;
$$;

create or replace function public.clock_in_add(person uuid, at timestamptz, note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  day date;
  made uuid;
begin
  if not public.clock_in_admin(auth.uid()) then
    raise exception 'Only the Owner or an Admin can add a clock-in.' using errcode = '42501';
  end if;
  if at is null then raise exception 'Give the time they arrived.'; end if;
  if at > now() + interval '5 minutes' then raise exception 'That time has not happened yet.'; end if;
  if not exists (select 1 from public.profiles where id = person) then raise exception 'Nobody by that name.'; end if;
  day := (at at time zone public.church_timezone())::date;
  if exists (select 1 from public.clock_ins where user_id = person and on_date = day) then
    raise exception 'They have already clocked in that day — change its time instead.';
  end if;
  perform set_config('rim.clock_in_note', left(nullif(btrim(coalesce(note, '')), ''), 500), true);
  insert into public.clock_ins (user_id, on_date, clocked_at, method, created_by)
  values (person, day, at, 'added', auth.uid())
  returning id into made;
  perform set_config('rim.clock_in_note', '', true);
  perform public.clock_in_mark_present(person, day);
  return made;
end;
$$;

/**
 * Takes a clock-in away. Present on Availability stays as it is: it may
 * have been marked by a head as well, and a head can still change it.
 */
create or replace function public.clock_in_remove(clock_in_id uuid, note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.clock_in_admin(auth.uid()) then
    raise exception 'Only the Owner or an Admin can remove a clock-in.' using errcode = '42501';
  end if;
  perform set_config('rim.clock_in_note', left(nullif(btrim(coalesce(note, '')), ''), 500), true);
  delete from public.clock_ins where id = clock_in_id;
  if not found then raise exception 'That clock-in has gone.'; end if;
  perform set_config('rim.clock_in_note', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The street addresses: a queue the `clock-in-address` function works
-- ---------------------------------------------------------------------------

alter table public.clock_ins
  add column if not exists address_tried_at timestamptz,
  add column if not exists address_tries smallint not null default 0;

/** One clock-in at a time, never two a second across every caller. */
create table if not exists public.clock_in_geocoder (
  id boolean primary key default true check (id),
  last_at timestamptz not null default 'epoch'
);
insert into public.clock_in_geocoder (id) values (true) on conflict do nothing;
alter table public.clock_in_geocoder enable row level security;

/**
 * The next clock-in whose address is wanted, if it is this caller's turn:
 * a second after the last lookup by anybody. Null means none is waiting,
 * or wait a moment and ask again (`wait_ms`). The service role's alone.
 */
create or replace function public.next_clock_in_address()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  row public.clock_ins%rowtype;
  waited double precision;
begin
  select * into row from public.clock_ins
  where address is null and latitude is not null and address_tries < 3
    and (address_tried_at is null or address_tried_at < now() - interval '2 minutes')
  order by created_at
  limit 1
  for update skip locked;
  if not found then return null; end if;

  update public.clock_in_geocoder set last_at = clock_timestamp()
  where last_at < clock_timestamp() - interval '1100 milliseconds';
  if not found then
    select extract(epoch from (last_at + interval '1100 milliseconds' - clock_timestamp())) * 1000 into waited
    from public.clock_in_geocoder;
    return jsonb_build_object('wait_ms', greatest(100, ceil(waited)));
  end if;

  update public.clock_ins set address_tried_at = now(), address_tries = address_tries + 1 where id = row.id;
  return jsonb_build_object('id', row.id, 'latitude', row.latitude, 'longitude', row.longitude);
end;
$$;

create or replace function public.set_clock_in_address(clock_in_id uuid, found_address text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.clock_ins
  set address = left(nullif(btrim(found_address), ''), 500), address_looked_up_at = now()
  where id = clock_in_id;
$$;

-- ---------------------------------------------------------------------------
-- Grants, and the helpers kept off the API
-- ---------------------------------------------------------------------------

revoke all on function public.church_today() from public, anon;
grant execute on function public.church_today() to authenticated;
revoke all on function public.clock_in_duties(uuid, date) from public, anon, authenticated;
revoke all on function public.clock_in_day_ends(date) from public, anon, authenticated;
revoke all on function public.clock_in_mark_present(uuid, date) from public, anon, authenticated;
revoke all on function public.metres_between(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.metres_between(double precision, double precision, double precision, double precision) to authenticated;

revoke all on function public.my_clock_in_today() from public, anon;
grant execute on function public.my_clock_in_today() to authenticated;
revoke all on function public.clock_in(double precision, double precision, double precision) from public, anon;
grant execute on function public.clock_in(double precision, double precision, double precision) to authenticated;
revoke all on function public.clock_in_set_time(uuid, timestamptz, text) from public, anon;
grant execute on function public.clock_in_set_time(uuid, timestamptz, text) to authenticated;
revoke all on function public.clock_in_add(uuid, timestamptz, text) from public, anon;
grant execute on function public.clock_in_add(uuid, timestamptz, text) to authenticated;
revoke all on function public.clock_in_remove(uuid, text) from public, anon;
grant execute on function public.clock_in_remove(uuid, text) to authenticated;

revoke all on function public.next_clock_in_address() from public, anon, authenticated;
grant execute on function public.next_clock_in_address() to service_role;
revoke all on function public.set_clock_in_address(uuid, text) from public, anon, authenticated;
grant execute on function public.set_clock_in_address(uuid, text) to service_role;

notify pgrst, 'reload schema';
