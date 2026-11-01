/*
 * A clock-in request says when they arrived.
 *
 * Somebody whose phone would not clock them in could ask an approver
 * (0194), but the request recorded only the moment they asked — so
 * whoever got there at 07:50, fought their phone for twenty minutes and
 * asked at 08:10 was clocked in at 08:10. Now the request carries the
 * time they say they arrived, chosen on a clock beside the note
 * (clock_in_requests.arrived_at): today, and not later than now. The
 * approver sees it, and approving clocks them in at it; a request without
 * one still clocks in at the time it was asked.
 *
 * clock_in_ask() gains "arrived"; the old six-argument form is replaced
 * rather than overloaded, so the app has one to call.
 */

alter table public.clock_in_requests
  add column if not exists arrived_at timestamptz;

comment on column public.clock_in_requests.arrived_at is
  'When they say they arrived, if they said (0225); approving clocks them in at it.';

drop function if exists public.clock_in_ask(double precision, double precision, double precision, timestamp with time zone, text, text);

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

revoke all on function public.clock_in_ask(double precision, double precision, double precision, timestamp with time zone, text, text, timestamp with time zone) from public, anon;
grant execute on function public.clock_in_ask(double precision, double precision, double precision, timestamp with time zone, text, text, timestamp with time zone) to authenticated;

create or replace function public.clock_in_decide(request_id uuid, approve boolean, note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      asked.user_id, asked.on_date, coalesce(asked.arrived_at, asked.asked_at), 'request', asked.latitude, asked.longitude,
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
      then 'You are clocked in at ' || to_char(coalesce(asked.arrived_at, asked.asked_at) at time zone public.church_timezone(), 'HH24:MI')
           || ' — approved by ' || coalesce(nullif(by_name, ''), 'an approver') || '.'
      else 'Your request to be clocked in was declined by ' || coalesce(nullif(by_name, ''), 'an approver')
           || coalesce(': ' || why, '.')
    end
  );
end;
$function$;

notify pgrst, 'reload schema';
