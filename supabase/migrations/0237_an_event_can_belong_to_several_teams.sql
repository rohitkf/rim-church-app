-- An event can belong to several teams, not only one or the whole church.
--
-- A rehearsal for Worship and Media together had to be filed under one of
-- them, or under the whole church, which said something else. So an event
-- (and a repeating series, 0235) now carries department_ids: every team it
-- is for. None means all teams — the whole church, as a null department_id
-- always has.
--
-- department_id stays, as the first of them: it is what the team colour,
-- the existing reads and older builds of the app go by. A trigger keeps the
-- two in step, so a build that writes only department_id still gets a list
-- of one, and a list always leads with department_id.
--
-- Who may add or change one: somebody who may add events (svc.events) for
-- every team on it. An event for all teams is still for whoever may add
-- one for the whole church.

alter table public.church_events add column if not exists department_ids uuid[] not null default '{}';
alter table public.church_event_series add column if not exists department_ids uuid[] not null default '{}';

update public.church_events
set department_ids = array[department_id]
where department_id is not null and cardinality(department_ids) = 0;

update public.church_event_series
set department_ids = array[department_id]
where department_id is not null and cardinality(department_ids) = 0;

/*
 * The list and the first of it, kept in step: no repeats, no nulls, and
 * department_id is always the list's first (or null when the list is empty).
 */
create or replace function public.event_teams_in_step()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cleaned uuid[];
begin
  select coalesce(array_agg(d order by first_at), '{}')
  into cleaned
  from (
    select d, min(i) as first_at
    from unnest(new.department_ids) with ordinality as t(d, i)
    where d is not null
    group by d
  ) teams;

  if tg_op = 'INSERT' then
    -- Written by a build that only knows the one team.
    if cardinality(cleaned) = 0 and new.department_id is not null then
      cleaned := array[new.department_id];
    end if;
  elsif new.department_ids is not distinct from old.department_ids
        and new.department_id is distinct from old.department_id then
    -- Only the one team changed: that build's whole answer.
    cleaned := case when new.department_id is null then '{}'::uuid[] else array[new.department_id] end;
  end if;

  new.department_ids := cleaned;
  new.department_id := cleaned[1];
  return new;
end;
$$;

drop trigger if exists church_events_teams_in_step on public.church_events;
create trigger church_events_teams_in_step
  before insert or update of department_id, department_ids on public.church_events
  for each row execute function public.event_teams_in_step();

drop trigger if exists church_event_series_teams_in_step on public.church_event_series;
create trigger church_event_series_teams_in_step
  before insert or update of department_id, department_ids on public.church_event_series
  for each row execute function public.event_teams_in_step();

/*
 * A team that goes takes its own events with it (the foreign key cascades),
 * but not one it shared: that one loses the team and stays for the rest.
 * Before the delete, so the cascade then finds nothing of theirs that is shared.
 */
create or replace function public.event_teams_drop_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.church_events
  set department_ids = array_remove(department_ids, old.id)
  where old.id = any(department_ids) and cardinality(department_ids) > 1;
  update public.church_event_series
  set department_ids = array_remove(department_ids, old.id)
  where old.id = any(department_ids) and cardinality(department_ids) > 1;
  return old;
end;
$$;

revoke all on function public.event_teams_drop_team() from public, anon, authenticated;

drop trigger if exists departments_leave_shared_events on public.departments;
create trigger departments_leave_shared_events
  before delete on public.departments
  for each row execute function public.event_teams_drop_team();

/*
 * May this person add events for every one of these teams? An empty list
 * is all teams: the whole church's call, as a null department_id was.
 */
create or replace function public.may_for_every_team(uid uuid, cap text, teams uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when cardinality(coalesce(teams, '{}')) = 0 then public.may(uid, cap, null::uuid)
    else coalesce((select bool_and(public.may(uid, cap, d)) from unnest(teams) d), false)
  end
$$;

revoke all on function public.may_for_every_team(uuid, text, uuid[]) from public, anon;
grant execute on function public.may_for_every_team(uuid, text, uuid[]) to authenticated;

alter policy church_events_insert on public.church_events
  with check (created_by = (select auth.uid()) and public.may_for_every_team((select auth.uid()), 'svc.events', department_ids));
alter policy church_events_update on public.church_events
  using (public.may_for_every_team((select auth.uid()), 'svc.events', department_ids))
  with check (public.may_for_every_team((select auth.uid()), 'svc.events', department_ids));
alter policy church_events_delete on public.church_events
  using (public.may_for_every_team((select auth.uid()), 'svc.events', department_ids));

alter policy church_event_series_insert on public.church_event_series
  with check (created_by = (select auth.uid()) and public.may_for_every_team((select auth.uid()), 'svc.events', department_ids));
alter policy church_event_series_update on public.church_event_series
  using (public.may_for_every_team((select auth.uid()), 'svc.events', department_ids))
  with check (public.may_for_every_team((select auth.uid()), 'svc.events', department_ids));
alter policy church_event_series_delete on public.church_event_series
  using (public.may_for_every_team((select auth.uid()), 'svc.events', department_ids));

-- The nightly fill (0235, 0236), now carrying every team to each event it makes.
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
          (title, details, event_date, ends_on, start_time, end_time, location, department_id, department_ids,
           created_by, series_id, repeat_rule)
        values
          (s.title, s.details, on_date, case when s.run_days > 0 then on_date + s.run_days end,
           s.start_time, s.end_time, s.location, s.department_id, s.department_ids,
           s.created_by, s.id, s.rule);
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
