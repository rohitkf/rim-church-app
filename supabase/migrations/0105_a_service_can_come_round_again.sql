/*
 * A service can come round again.
 *
 * Every Sunday service was typed in by hand, the week before, by whoever
 * remembered — and a church that forgot on a Saturday had no service to
 * ask availability for, no rota and no running order until somebody
 * noticed on the morning.
 *
 * So a service can repeat: every week, every two weeks, or once a month
 * (on the same date, or on the same weekday of the month — "the first
 * Sunday"). A nightly job keeps the next eight weeks filled for as long as
 * the repeat runs.
 *
 * **What it makes are ordinary services.** Each one is its own row with
 * its own running order, rota, availability and checklists, exactly as if
 * it had been typed in. The only thread back to where it came from is
 * `services.series_id`, and nothing follows that thread: deleting one
 * Sunday deletes that Sunday and nothing else, and editing one changes
 * that one. A repeat remembers how far it has already filled, never which
 * services it made, so a Sunday somebody deleted is not quietly put back
 * the next night.
 *
 * Stopping a repeat stops new ones. Everything already made stays.
 */

create table if not exists public.service_series (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (length(btrim(service_type)) > 0),
  /** Copied onto each new service as its running order. Gone is fine: the
   *  services still come, just without one. */
  template_id uuid references public.service_templates(id) on delete set null,
  frequency text not null check (
    frequency in ('weekly', 'fortnightly', 'monthly_date', 'monthly_weekday')
  ),
  /** The first service, and the date every later one is counted from. */
  anchor_date date not null,
  /**
   * The last date this repeat has already been filled to. Only dates after
   * it are ever made, which is what keeps a deleted Sunday deleted.
   */
  generated_through date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  /** Set once somebody stops it. Null is a repeat still running. */
  stopped_at timestamptz
);

alter table public.service_series enable row level security;

drop policy if exists service_series_select on public.service_series;
create policy service_series_select on public.service_series
  for select using (auth.uid() is not null);

-- Only an Admin makes services, so only an Admin makes or stops a repeat.
drop policy if exists service_series_write on public.service_series;
create policy service_series_write on public.service_series
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Where a service came from, and nothing more. `set null` so a repeat
-- being deleted never reaches the services it made.
alter table public.services
  add column if not exists series_id uuid references public.service_series(id) on delete set null;
create index if not exists services_series_id_idx on public.services (series_id);

/*
 * The nth date a repeat lands on, counting the first as 0.
 *
 * A month is the awkward one, both ways:
 *   - on a date: the 31st becomes the last day of a shorter month rather
 *     than a month with no service in it;
 *   - on a weekday: the 1st to 4th Sunday are what they say, and a 5th
 *     Sunday is read as "the last Sunday", because most months have none.
 */
create or replace function public.series_date(anchor date, frequency text, n int)
returns date
language plpgsql
immutable
as $$
declare
  month_start date;
  month_end date;
  nth int;
  dow int;
  first_dow date;
begin
  if frequency = 'weekly' then
    return anchor + 7 * n;
  elsif frequency = 'fortnightly' then
    return anchor + 14 * n;
  end if;

  month_start := (date_trunc('month', anchor) + make_interval(months => n))::date;
  month_end := (month_start + interval '1 month' - interval '1 day')::date;

  if frequency = 'monthly_date' then
    return least(month_start + (extract(day from anchor)::int - 1), month_end);
  end if;

  -- monthly_weekday
  dow := extract(dow from anchor)::int;
  nth := ceil(extract(day from anchor) / 7.0)::int;
  if nth >= 5 then
    return month_end - ((extract(dow from month_end)::int - dow + 7) % 7);
  end if;
  first_dow := month_start + ((dow - extract(dow from month_start)::int + 7) % 7);
  return first_dow + 7 * (nth - 1);
end;
$$;

/*
 * Fill every running repeat (or just one) out to eight weeks from today.
 *
 * A date that already has a service of that name is left alone — the
 * unique constraint on (date, service_type) would refuse it, and a service
 * somebody typed in by hand is not a clash to be fixed. Each new service
 * gets the template's running order, starting at the template's time in
 * the church's own timezone.
 */
create or replace function public.extend_service_series(only_series uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.service_series%rowtype;
  horizon date := current_date + 56;
  tz text := coalesce((select timezone from public.app_settings limit 1), 'Europe/London');
  on_date date;
  n int;
  made uuid;
  starts time;
begin
  for s in
    select * from public.service_series
    where stopped_at is null and (only_series is null or id = only_series)
    for update
  loop
    starts := (select t.start_time from public.service_templates t where t.id = s.template_id);
    n := 0;
    loop
      on_date := public.series_date(s.anchor_date, s.frequency, n);
      exit when on_date > horizon;
      -- Past the fill line, and not in the past — except the first, which
      -- somebody chose on purpose.
      if on_date > s.generated_through and (on_date >= current_date or n = 0) then
        made := null;
        insert into public.services (date, service_type, series_id)
        values (on_date, s.service_type, s.id)
        on conflict (date, service_type) do nothing
        returning id into made;

        if made is not null and starts is not null then
          insert into public.service_sessions
            (service_id, order_index, start_time, duration_minutes, session_name)
          select
            made,
            ts.order_index,
            ((on_date + starts) at time zone tz)
              + make_interval(mins => coalesce(sum(ts.duration_minutes) over (
                  order by ts.order_index rows between unbounded preceding and 1 preceding
                ), 0)::int),
            ts.duration_minutes,
            ts.session_name
          from public.service_template_sessions ts
          where ts.template_id = s.template_id;
        end if;
      end if;
      n := n + 1;
    end loop;

    update public.service_series
    set generated_through = greatest(generated_through, horizon)
    where id = s.id;
  end loop;
end;
$$;

-- The nightly job and the function below call this; nobody else needs to.
revoke all on function public.extend_service_series(uuid) from public, anon, authenticated;

/*
 * Start a repeat, and make its first eight weeks straight away — so the
 * page that just asked for it can open the first one.
 *
 * Returns the first service's id.
 */
create or replace function public.create_service_series(
  first_date date,
  service_name text,
  how_often text,
  template uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  series uuid;
  first_service uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can add services.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.services where date = first_date and service_type = btrim(service_name)
  ) then
    raise exception 'There is already a % on that date.', btrim(service_name) using errcode = '23505';
  end if;

  insert into public.service_series
    (service_type, template_id, frequency, anchor_date, generated_through, created_by)
  values
    (btrim(service_name), template, how_often, first_date, first_date - 1, auth.uid())
  returning id into series;

  perform public.extend_service_series(series);

  select id into first_service
  from public.services
  where series_id = series and date = first_date;
  return first_service;
end;
$$;

revoke all on function public.create_service_series(date, text, text, uuid) from public, anon;
grant execute on function public.create_service_series(date, text, text, uuid) to authenticated;

-- Nightly, just after midnight UTC, so the eighth week out is always there
-- by the time anyone looks. Guarded like 0099's: CI's bare Postgres has no
-- pg_cron.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'extend-service-series',
      '15 0 * * *',
      $job$ select public.extend_service_series(); $job$
    );
  else
    raise notice 'pg_cron unavailable; skipping repeating-service schedule';
  end if;
end $$;
