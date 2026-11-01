-- An event can say when it ends, not only when it starts.
--
-- A meeting from 7:00 to 8:30 said only "from 7:00", so nobody could
-- tell whether to keep the rest of the evening. end_time is optional, as
-- start_time is; on a run of days it is the time on its last day. A
-- repeating series carries it too (0235), so every time it makes ends
-- when the first one did.
--
-- On one day, the end comes after the start: an end before it is a
-- mistake the database refuses rather than a diary that reads backwards.

alter table public.church_events add column if not exists end_time time;
alter table public.church_event_series add column if not exists end_time time;

alter table public.church_events drop constraint if exists church_events_ends_after_it_starts;
alter table public.church_events add constraint church_events_ends_after_it_starts
  check (
    end_time is null or start_time is null
    or (ends_on is not null and ends_on > event_date)
    or end_time > start_time
  );

-- The nightly fill (0235), now carrying the end time to every event it makes.
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
          (title, details, event_date, ends_on, start_time, end_time, location, department_id, created_by, series_id, repeat_rule)
        values
          (s.title, s.details, on_date, case when s.run_days > 0 then on_date + s.run_days end,
           s.start_time, s.end_time, s.location, s.department_id, s.created_by, s.id, s.rule);
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

notify pgrst, 'reload schema';
