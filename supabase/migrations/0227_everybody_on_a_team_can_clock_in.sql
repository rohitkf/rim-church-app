/*
 * Everybody on a team can clock in.
 *
 * The Clock In button showed only to somebody with a duty that day: a
 * place on the rota, or a Yes on availability. On Sunday 1 November 11 of
 * the 39 people on a team had neither, and found no button. Now anybody on
 * a team (its roster, Head or Assisting Heads) can clock in on a day with
 * a service, from a few minutes before the earliest call time of their
 * teams (07:00 where none is set), as everybody else does.
 *
 * clock_in_first_call(uid, day) is that moment: the earliest call of
 * their duties, else of their teams when the day has a service. It
 * replaces the duty-only lookup in my_clock_in_today(), clock_in() and
 * clock_in_ask(). The Clock-ins page files somebody with no duty under
 * the teams they are on (clock_in_day_teams()).
 *
 * What a duty means is unchanged: the call-time reminder, "still to
 * arrive" and being marked Present still follow the rota and a Yes, so
 * nobody who is not serving is pushed or marked present for it.
 */

create or replace function public.clock_in_member_teams(uid uuid)
returns table(department_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.department_id from public.department_members m where m.user_id = uid
  union
  select r.department_id from public.user_roles r
  where r.user_id = uid and r.department_id is not null and r.role_type in ('department_head', 'assisting_head');
$$;

create or replace function public.clock_in_first_call(uid uuid, on_day date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select min(d.call_at) from public.clock_in_duties(uid, on_day) d),
    (select min((on_day + coalesce(ct.call_time, time '07:00')) at time zone public.church_timezone())
     from public.clock_in_member_teams(uid) t
     left join public.department_call_times ct on ct.department_id = t.department_id and ct.on_date = on_day
     where exists (select 1 from public.services s where s.date = on_day))
  );
$$;

revoke all on function public.clock_in_member_teams(uuid) from public, anon, authenticated;
revoke all on function public.clock_in_first_call(uuid, date) from public, anon, authenticated;

create or replace function public.my_clock_in_today()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  today date := public.church_today();
  first_call timestamptz;
  lead integer := coalesce((select clock_in_lead_minutes from public.app_settings limit 1), 5);
  done public.clock_ins%rowtype;
  asked public.clock_in_requests%rowtype;
begin
  if uid is null then return jsonb_build_object('due', false); end if;
  first_call := public.clock_in_first_call(uid, today);
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
$function$;

create or replace function public.clock_in(lat double precision, lng double precision, accuracy double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  first_call := public.clock_in_first_call(uid, today);
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
$function$;

create or replace function public.clock_in_ask(lat double precision DEFAULT NULL::double precision, lng double precision DEFAULT NULL::double precision, accuracy double precision DEFAULT NULL::double precision, read_at timestamp with time zone DEFAULT NULL::timestamp with time zone, failed_because text DEFAULT NULL::text, note text DEFAULT NULL::text, arrived timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  first_call := public.clock_in_first_call(uid, today);
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
  -- When they say they got there (0225): today, and not later than now.
  if arrived is not null and (
       (arrived at time zone public.church_timezone())::date <> today
       or arrived > now() + interval '1 minute'
     ) then
    raise exception 'Choose a time earlier today, not later than now.';
  end if;

  select * into place from public.clock_in_place limit 1;
  if found and lat is not null then
    away := public.metres_between(place.latitude, place.longitude, lat, lng);
  end if;

  insert into public.clock_in_requests (
    user_id, on_date, note, latitude, longitude, accuracy_m, distance_m, read_at, failed_because, arrived_at
  )
  values (
    uid, today, left(nullif(btrim(coalesce(note, '')), ''), 500), lat, lng,
    case when lat is null then null else accuracy end, away,
    case when lat is null then null else coalesce(read_at, now()) end,
    case when failed_because in ('too_rough', 'too_far', 'blocked', 'nothing') then failed_because end,
    least(arrived, now())
  )
  returning id into made;

  select btrim(first_name || ' ' || last_name) into who from public.profiles where id = uid;
  says := coalesce(nullif(who, ''), 'Somebody') || ' asks to be clocked in at '
    || to_char(coalesce(least(arrived, now()), now()) at time zone public.church_timezone(), 'HH24:MI')
    || case when arrived is not null then ' (the time they say they arrived)' else '' end
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
$function$;

create or replace function public.clock_in_day_teams(on_day date)
 RETURNS TABLE(user_id uuid, department_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- By their duties that day; somebody with none, under the teams they are on (0227).
  with by_duty as (
    select distinct c.user_id, d.department_id
    from public.clock_ins c
    cross join lateral public.clock_in_duties(c.user_id, c.on_date) d
    where c.on_date = on_day
  )
  select b.user_id, b.department_id from by_duty b
  where public.may_see_clock_ins(auth.uid())
  union
  select c.user_id, t.department_id
  from public.clock_ins c
  cross join lateral public.clock_in_member_teams(c.user_id) t
  where c.on_date = on_day
    and public.may_see_clock_ins(auth.uid())
    and not exists (select 1 from by_duty b where b.user_id = c.user_id);
$function$;

notify pgrst, 'reload schema';
