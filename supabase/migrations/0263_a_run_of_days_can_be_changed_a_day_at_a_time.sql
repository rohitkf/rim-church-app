/*
 * A run of days can be changed a day at a time (asked for by the Owner,
 * November 2026).
 *
 * An event over several days — a conference, a camp, a week of prayer —
 * is one row from event_date to ends_on, drawn on each day (0128). So the
 * second day could not move to another hall, nor the last be dropped: any
 * change was to every day of it. Meetings had "only this one" and "this
 * one and every one after it" (0234); a run now has the same, and "every
 * day of it".
 *
 * Changing one day splits the run, once, into a row per day — joined by a
 * series_id as a meeting's are, with repeat_rule 'daily' — and the change
 * then lands on the day or days it was asked of. A run nobody changes a
 * day of stays one row, as before. The days keep what the run said: the
 * start time on its first day and the end time on its last (0236), its
 * Event or Meeting (0262), its teams and its links, and the name of
 * whoever put it in the diary.
 *
 * event_run_split(event) does it in one step. It runs as the owner, since
 * the insert rule wants created_by to be the caller and the days must keep
 * the run's author; so it asks the same rule an edit does — may_for_every_
 * team(svc.events) for the run's teams — first.
 */

alter table public.church_events drop constraint if exists church_events_repeat_rule_is_known;
alter table public.church_events add constraint church_events_repeat_rule_is_known
  check (repeat_rule is null or repeat_rule in ('daily', 'weekly', 'fortnightly', 'monthly_date', 'monthly_weekday', 'yearly'));

create or replace function public.event_run_split(p_event uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.church_events%rowtype;
  series uuid := gen_random_uuid();
  d date;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into e from public.church_events where id = p_event for update;
  if not found then raise exception 'That event has gone.'; end if;
  if not public.may_for_every_team(auth.uid(), 'svc.events', e.department_ids) then
    raise exception 'Changing that event is not open to you.' using errcode = '42501';
  end if;
  -- Already a day of its own, or one of a series: nothing to split.
  if e.series_id is not null or e.ends_on is null or e.ends_on <= e.event_date then
    return e.series_id;
  end if;

  for d in select generate_series(e.event_date, e.ends_on, interval '1 day')::date loop
    insert into public.church_events
      (title, details, event_date, ends_on, start_time, end_time, location, link, links,
       department_id, department_ids, created_by, series_id, repeat_rule, category)
    values
      (e.title, e.details, d, null,
       case when d = e.event_date then e.start_time end,
       case when d = e.ends_on then e.end_time end,
       e.location, e.link, e.links, e.department_id, e.department_ids, e.created_by,
       series, 'daily', e.category);
  end loop;

  delete from public.church_events where id = e.id;
  return series;
end;
$$;

revoke all on function public.event_run_split(uuid) from public, anon;
grant execute on function public.event_run_split(uuid) to authenticated;

notify pgrst, 'reload schema';
