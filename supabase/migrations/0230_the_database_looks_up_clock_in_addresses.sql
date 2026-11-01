-- The database looks up clock-in addresses itself.
--
-- Every phone clock-in on 1 November said "Address not found". The
-- `clock-in-address` edge function ran each time and answered 200, but
-- OpenStreetMap's Nominatim refused it — it turns away shared cloud
-- addresses like the one edge functions leave from — and the function
-- counted each refusal as a try, so after three every row gave up. The
-- same request sent from the database (pg_net) is answered at once.
--
-- So the database does it, and the edge function has nothing left to do:
--
-- * Every three seconds a job collects any answer that has come back,
--   writes the street onto the clock-in (or request), and sends the next
--   lookup — one at a time, never more than one a second, as Nominatim
--   asks, with the app named in the User-Agent.
-- * next_clock_in_address() — the edge function's queue — now hands out
--   nothing, so the function, still called by the app after a clock-in,
--   stops spending tries. set_clock_in_address() is kept and reused.
-- * A refused or failed lookup is a try; five tries, two minutes apart.
-- * Everything that ran out of tries is tried again from the start.

-- Lookups sent and not yet answered.
create table if not exists public.clock_in_geocode_calls (
  request_id bigint primary key,
  target uuid not null,
  sent_at timestamptz not null default now()
);
alter table public.clock_in_geocode_calls enable row level security;
-- No policies: nobody reads it but the job.

/** "12 High Street, Caversham, Reading, RG4 8AA" — the edge function's shortAddress, in SQL. */
create or replace function public.clock_in_short_address(place jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  a jsonb := coalesce(place -> 'address', '{}'::jsonb);
  street text;
  parts text[];
  unique_parts text[] := '{}';
  p text;
begin
  if place ? 'error' then return 'No street address here'; end if;
  street := btrim(concat_ws(' ', a ->> 'house_number', coalesce(a ->> 'road', a ->> 'pedestrian', a ->> 'footway')));
  parts := array[
    coalesce(nullif(street, ''), a ->> 'building', a ->> 'amenity', place ->> 'name', ''),
    coalesce(a ->> 'suburb', a ->> 'neighbourhood', a ->> 'quarter', ''),
    coalesce(a ->> 'town', a ->> 'city', a ->> 'village', a ->> 'hamlet', ''),
    coalesce(a ->> 'postcode', '')
  ];
  foreach p in array parts loop
    p := btrim(p);
    if p <> '' and not (p = any (unique_parts)) then unique_parts := unique_parts || p; end if;
  end loop;
  if cardinality(unique_parts) > 0 then return array_to_string(unique_parts, ', '); end if;
  if place ->> 'display_name' is not null then
    return btrim(array_to_string((string_to_array(place ->> 'display_name', ','))[1:4], ','));
  end if;
  return 'No street address here';
end;
$$;

/** The next position waiting for its street, from either table, marked as tried. */
create or replace function public.clock_in_address_take()
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
begin
  select c.id, c.latitude, c.longitude into found_id, found_lat, found_lng
  from public.clock_ins c
  where c.address is null and c.latitude is not null and c.address_tries < 5
    and (c.address_tried_at is null or c.address_tried_at < now() - interval '2 minutes')
  order by c.created_at
  limit 1
  for update skip locked;
  if found_id is null then
    select r.id, r.latitude, r.longitude into found_id, found_lat, found_lng
    from public.clock_in_requests r
    where r.address is null and r.latitude is not null and r.address_tries < 5
      and (r.address_tried_at is null or r.address_tried_at < now() - interval '2 minutes')
    order by r.created_at
    limit 1
    for update skip locked;
    from_requests := found_id is not null;
  end if;
  if found_id is null then return null; end if;

  if from_requests then
    update public.clock_in_requests set address_tried_at = now(), address_tries = address_tries + 1 where id = found_id;
  else
    update public.clock_ins set address_tried_at = now(), address_tries = address_tries + 1 where id = found_id;
  end if;
  return jsonb_build_object('id', found_id, 'latitude', found_lat, 'longitude', found_lng);
end;
$$;

/** One turn of the job: take in what has come back, then send the next. */
create or replace function public.clock_in_addresses_tick()
returns void
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  call record;
  answer record;
  place jsonb;
  next jsonb;
  request bigint;
begin
  for call in select * from public.clock_in_geocode_calls loop
    select r.status_code, r.content, r.timed_out, r.error_msg into answer
    from net._http_response r where r.id = call.request_id;
    if not found then
      -- Never answered, and pg_net has forgotten it: the try is spent.
      if call.sent_at < now() - interval '2 minutes' then
        delete from public.clock_in_geocode_calls where request_id = call.request_id;
      end if;
      continue;
    end if;
    if answer.status_code = 200 then
      begin
        place := answer.content::jsonb;
        perform public.set_clock_in_address(call.target, public.clock_in_short_address(place));
      exception when others then
        null; -- Not JSON: the try is spent, and it is tried again later.
      end;
    end if;
    delete from public.clock_in_geocode_calls where request_id = call.request_id;
  end loop;

  -- One lookup out at a time: Nominatim allows one a second, and this job
  -- runs every three.
  if exists (select 1 from public.clock_in_geocode_calls) then return; end if;
  next := public.clock_in_address_take();
  if next is null then return; end if;

  select net.http_get(
    url := 'https://nominatim.openstreetmap.org/reverse',
    params := jsonb_build_object(
      'format', 'jsonv2',
      'lat', next ->> 'latitude',
      'lon', next ->> 'longitude',
      'zoom', '18',
      'addressdetails', '1',
      'accept-language', 'en-GB'
    ),
    headers := jsonb_build_object(
      'User-Agent', 'RIM-Church-App/1.0 (+https://rim-church-app.vercel.app)',
      'Accept', 'application/json'
    ),
    timeout_milliseconds := 15000
  ) into request;
  insert into public.clock_in_geocode_calls (request_id, target) values (request, (next ->> 'id')::uuid);
end;
$$;

revoke all on function public.clock_in_short_address(jsonb) from public, anon, authenticated;
revoke all on function public.clock_in_address_take() from public, anon, authenticated;
revoke all on function public.clock_in_addresses_tick() from public, anon, authenticated;

-- The edge function's queue is empty from now on: the database does the work.
create or replace function public.next_clock_in_address()
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select null::jsonb;
$$;
revoke all on function public.next_clock_in_address() from public, anon, authenticated;
grant execute on function public.next_clock_in_address() to service_role;

-- What ran out of tries against the refusals gets its turns again.
update public.clock_ins set address_tries = 0, address_tried_at = null
where address is null and latitude is not null;
update public.clock_in_requests set address_tries = 0, address_tried_at = null
where address is null and latitude is not null;

select cron.unschedule(jobid) from cron.job where jobname = 'clock-in-addresses';
select cron.schedule('clock-in-addresses', '3 seconds', $$select public.clock_in_addresses_tick()$$);
