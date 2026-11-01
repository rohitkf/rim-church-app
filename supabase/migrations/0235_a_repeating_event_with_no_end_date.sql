-- A repeating event with no end date, kept going the way repeating
-- services are (0105).
--
-- 0234 made every repeat up front, to a last date. An event that simply
-- goes on — the Tuesday prayer meeting — has no last date, and making
-- years of rows ahead would fill the diary with guesses. So, as for a
-- service that comes round again, the series is a row of its own that
-- says what each time is, and a nightly job keeps its rows filled out to
-- six months from today. Rows already made stay as they were edited; a
-- date the series already has is never made twice; and the 60-day tidy-up
-- (0219) still takes the past ones, which generated_through stops being
-- made again.
--
-- The series row's id is the series_id its events carry, so a series that
-- was made to a last date becomes open-ended by adding its row.
--
-- Who may make or change one is who may add the event (svc.events for its
-- team), checked by the series' own policies as the events' are.

create table if not exists public.church_event_series (
  id uuid primary key,
  title text not null,
  details text,
  start_time time,
  location text,
  department_id uuid references public.departments (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  -- Any date of the series: every other is counted from it by the rule.
  anchor_date date not null,
  -- Extra days a run lasts (a weekend camp is 2); 0 for one day.
  run_days int not null default 0 check (run_days between 0 and 60),
  rule text not null check (rule in ('weekly', 'fortnightly', 'monthly_date', 'monthly_weekday', 'yearly')),
  -- Made up to here; the job makes the rest.
  generated_through date not null,
  stopped_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists church_event_series_department_idx on public.church_event_series (department_id);
create index if not exists church_event_series_created_by_idx on public.church_event_series (created_by);

alter table public.church_event_series enable row level security;

create policy church_event_series_select on public.church_event_series
  for select using ((select public.can_open_page((select auth.uid()), 'events')));
create policy church_event_series_insert on public.church_event_series
  for insert with check (created_by = (select auth.uid()) and public.may((select auth.uid()), 'svc.events', department_id));
create policy church_event_series_update on public.church_event_series
  for update using (public.may((select auth.uid()), 'svc.events', department_id))
  with check (public.may((select auth.uid()), 'svc.events', department_id));
create policy church_event_series_delete on public.church_event_series
  for delete using (public.may((select auth.uid()), 'svc.events', department_id));

/*
 * The nth date of a series, counting the anchor as 0 — the same answers
 * as the app's lib/eventRepeat: the 31st in a short month is its last day,
 * 29 February is the 28th in other years, and a weekday in the last seven
 * days of its month is "the last" one, whatever the month.
 */
create or replace function public.event_series_date(anchor date, rule text, n int)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  month_start date;
  month_end date;
  anchor_month_end date;
  dow int;
  nth int;
  first_dow date;
  y int;
begin
  if rule = 'weekly' then return anchor + 7 * n; end if;
  if rule = 'fortnightly' then return anchor + 14 * n; end if;
  if rule = 'yearly' then
    y := extract(year from anchor)::int + n;
    return make_date(y, extract(month from anchor)::int,
      least(extract(day from anchor)::int,
            extract(day from (make_date(y, extract(month from anchor)::int, 1) + interval '1 month' - interval '1 day'))::int));
  end if;

  month_start := (date_trunc('month', anchor) + make_interval(months => n))::date;
  month_end := (month_start + interval '1 month' - interval '1 day')::date;
  if rule = 'monthly_date' then
    return least(month_start + (extract(day from anchor)::int - 1), month_end);
  end if;

  -- monthly_weekday
  dow := extract(dow from anchor)::int;
  anchor_month_end := (date_trunc('month', anchor) + interval '1 month' - interval '1 day')::date;
  if anchor + 7 > anchor_month_end then
    return month_end - ((extract(dow from month_end)::int - dow + 7) % 7);
  end if;
  nth := floor((extract(day from anchor)::int - 1) / 7.0)::int;
  first_dow := month_start + ((dow - extract(dow from month_start)::int + 7) % 7);
  return first_dow + 7 * nth;
end;
$$;

/*
 * Fill every running series (or one) out to six months from today.
 * Called nightly, and by the app straight after a series is made or
 * changed — then only for a series the caller may change.
 */
create or replace function public.extend_event_series(only_series uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.church_event_series%rowtype;
  horizon date := current_date + 183;
  on_date date;
  n int;
  made int := 0;
begin
  if only_series is not null and auth.uid() is not null then
    select * into s from public.church_event_series where id = only_series;
    if not found then raise exception 'That repeating event has gone.'; end if;
    if not public.may(auth.uid(), 'svc.events', s.department_id) then
      raise exception 'Changing that event is not open to you.' using errcode = '42501';
    end if;
  end if;

  for s in
    select * from public.church_event_series
    where stopped_at is null and (only_series is null or id = only_series)
    for update
  loop
    n := 0;
    loop
      on_date := public.event_series_date(s.anchor_date, s.rule, n);
      exit when on_date > horizon or n > 2000;
      if on_date > s.generated_through and on_date >= current_date
         and not exists (select 1 from public.church_events e where e.series_id = s.id and e.event_date = on_date) then
        insert into public.church_events
          (title, details, event_date, ends_on, start_time, location, department_id, created_by, series_id, repeat_rule)
        values
          (s.title, s.details, on_date, case when s.run_days > 0 then on_date + s.run_days end,
           s.start_time, s.location, s.department_id, s.created_by, s.id, s.rule);
        made := made + 1;
      end if;
      n := n + 1;
    end loop;

    update public.church_event_series
    set generated_through = greatest(generated_through, horizon)
    where id = s.id;
  end loop;
  return made;
end;
$$;

revoke all on function public.extend_event_series(uuid) from public, anon;
grant execute on function public.extend_event_series(uuid) to authenticated;

-- Nightly, beside the services' own (0105). Only where pg_cron is.
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'extend-event-series';
    perform cron.schedule('extend-event-series', '20 0 * * *', 'select public.extend_event_series()');
  end if;
end $cron$;

notify pgrst, 'reload schema';
