/*
 * Event or Meeting is the person's choice (asked for by the Owner,
 * November 2026).
 *
 * The Events page has shown a repeating entry as a Meeting and a one-off as
 * an Event (0234), worked out from repeat_rule and stored nowhere. That
 * called a weekly fundraiser a meeting and a one-off members' meeting an
 * event. Now each entry carries its own `category`, chosen when it is made
 * and changeable after, and repeating no longer decides it.
 *
 * Every entry keeps the label it shows today: those that repeat become
 * 'meeting', the rest 'event'. A series (0235) carries the choice too, so
 * the ones the nightly fill makes from it say the same. An entry made
 * without saying — a registration's diary row (0244) — is an Event.
 *
 * The backfill does not touch updated_at/updated_by: nobody edited these.
 */

alter table public.church_events
  add column if not exists category text not null default 'event'
    check (category in ('event', 'meeting'));
alter table public.church_event_series
  add column if not exists category text not null default 'event'
    check (category in ('event', 'meeting'));

alter table public.church_events disable trigger church_events_touch;
update public.church_events set category = 'meeting' where repeat_rule is not null;
alter table public.church_events enable trigger church_events_touch;
update public.church_event_series set category = 'meeting';

-- The nightly fill (0235–0240), now carrying the choice to every event it makes.
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
    if not public.may_for_every_team(auth.uid(), 'svc.events', s.department_ids) then
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
          (title, details, event_date, ends_on, start_time, end_time, location, link, links, department_id, department_ids,
           created_by, series_id, repeat_rule, category)
        values
          (s.title, s.details, on_date, case when s.run_days > 0 then on_date + s.run_days end,
           s.start_time, s.end_time, s.location, s.link, s.links, s.department_id, s.department_ids,
           s.created_by, s.id, s.rule, s.category);
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
