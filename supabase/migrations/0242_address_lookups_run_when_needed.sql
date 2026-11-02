-- The address lookups run when there is something to look up, and the
-- job history is cleared daily.
--
-- 0230's job ran every three seconds, all day, every day: 28,800 runs a
-- day, nearly all of them finding nothing, since clock-ins happen around
-- services. pg_cron logs every run, so its history (cron.job_run_details)
-- became the largest table in the database — 46,000 rows, about 10 MB —
-- and the database never had a quiet moment.
--
-- Now:
-- * 'clock-in-addresses' runs once a minute: the safety net, so nothing
--   waits longer than that even if the rest misses.
-- * A clock-in (or request) with a position and no street starts
--   'clock-in-addresses-now', every three seconds as before (one lookup a
--   second at most, as Nominatim asks), so an address still appears
--   within seconds on a Sunday.
-- * Each run checks whether anything is still waiting — a lookup sent and
--   not answered, or a row with tries left — and when nothing is, the fast
--   job unschedules itself.
-- * The job history keeps one day rather than a week, cleared every night
--   at 03:30 UTC rather than on Tuesdays (0132). The webhook log keeps its
--   week.
--
-- Every cron call is guarded, so a database without pg_cron (CI) is not
-- touched.

/** One step of the lookups (0230's tick, unchanged): take in what has come back, then send the next. */
create or replace function public.clock_in_addresses_step()
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


/** Anything still waiting for its street: a lookup in flight, or a position with tries left. */
create or replace function public.clock_in_addresses_pending()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.clock_in_geocode_calls)
      or exists (select 1 from public.clock_ins
                 where address is null and latitude is not null and address_tries < 5)
      or exists (select 1 from public.clock_in_requests
                 where address is null and latitude is not null and address_tries < 5);
$$;

/** Start the fast lookups, if they are not already running. */
create or replace function public.clock_in_addresses_hurry()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if to_regclass('cron.job') is null then return; end if;
  if exists (select 1 from cron.job where jobname = 'clock-in-addresses-now') then return; end if;
  perform cron.schedule('clock-in-addresses-now', '3 seconds', 'select public.clock_in_addresses_tick()');
end;
$$;

/** One run: a step of the lookups, then the fast job kept going or let go. */
create or replace function public.clock_in_addresses_tick()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  perform public.clock_in_addresses_step();
  if to_regclass('cron.job') is null then return; end if;
  if public.clock_in_addresses_pending() then
    perform public.clock_in_addresses_hurry();
  else
    perform cron.unschedule(jobid) from cron.job where jobname = 'clock-in-addresses-now';
  end if;
end;
$$;

/** A new position with no street: start looking now, not at the next minute. */
create or replace function public.clock_in_address_wanted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.latitude is not null and new.address is null then
    perform public.clock_in_addresses_hurry();
  end if;
  return new;
end;
$$;

revoke all on function public.clock_in_addresses_step() from public, anon, authenticated;
revoke all on function public.clock_in_addresses_pending() from public, anon, authenticated;
revoke all on function public.clock_in_addresses_hurry() from public, anon, authenticated;
revoke all on function public.clock_in_addresses_tick() from public, anon, authenticated;
revoke all on function public.clock_in_address_wanted() from public, anon, authenticated;

drop trigger if exists clock_ins_address_wanted on public.clock_ins;
create trigger clock_ins_address_wanted
  after insert or update of latitude, address_tries on public.clock_ins
  for each row execute function public.clock_in_address_wanted();

drop trigger if exists clock_in_requests_address_wanted on public.clock_in_requests;
create trigger clock_in_requests_address_wanted
  after insert or update of latitude, address_tries on public.clock_in_requests
  for each row execute function public.clock_in_address_wanted();

/* The job history: one day kept, not seven (0132); the webhook log keeps its week. */
create or replace function public.prune_platform_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from cron.job_run_details where end_time < now() - interval '1 day';
  if to_regclass('supabase_functions.hooks') is not null then
    delete from supabase_functions.hooks where created_at < now() - interval '7 days';
  end if;
end;
$$;

revoke all on function public.prune_platform_logs() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'clock-in-addresses';
    perform cron.schedule('clock-in-addresses', '* * * * *', 'select public.clock_in_addresses_tick()');
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-platform-logs';
    perform cron.schedule('prune-platform-logs', '30 3 * * *', 'select public.prune_platform_logs();');
    -- The week of history already there goes now, not tomorrow night.
    perform public.prune_platform_logs();
  end if;
end $cron$;

notify pgrst, 'reload schema';
