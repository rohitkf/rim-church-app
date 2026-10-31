/*
 * Call times reach each team by push.
 *
 * A call time (0076) sat on the Team Rota page and went nowhere: a team
 * found out when it was due by opening the app on a Saturday night. Now:
 *
 *   - Every week, at the day and time the church sets (Saturday 20:00 out
 *     of the box, Settings › Page by Page › Team Rota), everybody on a team
 *     is told when they are due for each service day in the coming week:
 *     "Call times for Sunday 1 November: Worship 08:00, Media 07:00." One
 *     message per person per day, naming each of their teams. Never stops
 *     it.
 *   - When somebody sets, changes or clears a team's call time for a day
 *     still to come, everybody on that team is told at once: "Worship's
 *     call time for Sunday 1 November is now 08:30."
 *   - remind_call_times(team, day) sends a team its call time on demand,
 *     for whoever may set that team's call time (svc.call_times: the
 *     Owner, Admins, its Head and Assisting Heads out of the box). With no
 *     team, every team, for whoever may set every team's.
 *
 * "Everybody on a team" is its roster, core and guest, and its Head and
 * Assisting Heads. The person who made a change or pressed Remind is not
 * told. A team nobody has set is due at 07:00, as the page says.
 *
 * Each goes out as a notification of type call_time, which the bell shows
 * and the push function sends, with its own words.
 */

alter table public.app_settings
  add column if not exists call_time_notice_dow smallint default 6
    check (call_time_notice_dow is null or call_time_notice_dow between 0 and 6),
  add column if not exists call_time_notice_time time not null default '20:00',
  -- The church-local day the weekly notice last went, so it goes once.
  add column if not exists call_time_notice_sent_on date;

update public.app_settings set call_time_notice_dow = 6 where call_time_notice_dow is null;

comment on column public.app_settings.call_time_notice_dow is
  'The weekday (0 Sunday … 6 Saturday) the week''s call times are pushed to each team; null never (0224).';
comment on column public.app_settings.call_time_notice_time is
  'The church-local time on that day the week''s call times are pushed (0224).';

/* A team's call time on a day: as set, or the usual seven o'clock. */
create or replace function public.call_time_on(dept uuid, d date)
returns time
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select c.call_time from public.department_call_times c where c.department_id = dept and c.on_date = d),
    time '07:00'
  );
$$;

/* Everybody on a team: its roster, its Head and its Assisting Heads. */
create or replace function public.team_people(dept uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id from public.department_members m where m.department_id = dept
  union
  select r.user_id from public.user_roles r
  where r.department_id = dept and r.role_type in ('department_head', 'assisting_head');
$$;

/* "Sunday 1 November". */
create or replace function public.call_time_day(d date)
returns text
language sql
immutable
as $$ select to_char(d, 'FMDay FMDD FMMonth') $$;

/* One person's call times on a day, every team of theirs, or null if none. */
create or replace function public.call_times_text(uid uuid, d date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'Call times for ' || public.call_time_day(d) || ': '
         || string_agg(dp.name || ' ' || to_char(public.call_time_on(dp.id, d), 'HH24:MI'), ', ' order by public.call_time_on(dp.id, d), dp.name)
         || '.'
  from public.departments dp
  where exists (select 1 from public.team_people(dp.id) p where p.user_id = uid)
  having count(*) > 0;
$$;

revoke all on function public.call_time_on(uuid, date) from public, anon;
revoke all on function public.team_people(uuid) from public, anon, authenticated;
revoke all on function public.call_times_text(uuid, date) from public, anon, authenticated;
grant execute on function public.call_time_on(uuid, date) to authenticated;

/*
 * The weekly notice. Run every minute; goes once, on the day and after the
 * time set, for each service day in the seven days after today.
 */
create or replace function public.send_weekly_call_times()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings%rowtype;
  local_now timestamp := now() at time zone public.church_timezone();
  today date := (now() at time zone public.church_timezone())::date;
  d date;
  sent integer := 0;
  n integer;
begin
  select * into s from public.app_settings limit 1;
  if not found or s.call_time_notice_dow is null then
    return 0;
  end if;
  if extract(dow from local_now)::int <> s.call_time_notice_dow
     or local_now::time < s.call_time_notice_time
     or s.call_time_notice_sent_on is not distinct from today then
    return 0;
  end if;

  update public.app_settings set call_time_notice_sent_on = today;

  for d in
    select distinct sv.date from public.services sv
    where sv.date > today and sv.date <= today + 7
    order by sv.date
  loop
    insert into public.notifications (user_id, type, reference_id, body)
    select w.user_id, 'call_time', null, public.call_times_text(w.user_id, d)
    from (
      select distinct p.user_id
      from public.departments dp, lateral public.team_people(dp.id) p
    ) w
    where public.call_times_text(w.user_id, d) is not null;
    get diagnostics n = row_count;
    sent := sent + n;
  end loop;
  return sent;
end;
$$;

revoke all on function public.send_weekly_call_times() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'weekly-call-times';
    perform cron.schedule('weekly-call-times', '* * * * *', 'select public.send_weekly_call_times()');
  end if;
end $cron$;

/* A call time set, changed or cleared for a day to come: that team is told. */
create or replace function public.call_time_changed_notifies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dept uuid := coalesce(new.department_id, old.department_id);
  d date := coalesce(new.on_date, old.on_date);
  team text;
  said text;
begin
  if d < (now() at time zone public.church_timezone())::date then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.call_time is not distinct from new.call_time then
    return null;
  end if;
  select name into team from public.departments where id = dept;
  if team is null then
    return null;
  end if;
  said := case
    when tg_op = 'DELETE' then format('%s''s call time for %s is back to the usual 07:00.', team, public.call_time_day(d))
    else format('%s''s call time for %s is now %s.', team, public.call_time_day(d), to_char(new.call_time, 'HH24:MI'))
  end;

  -- The bell keeps the newest word on it, not every change on the way.
  delete from public.notifications n
  where n.type = 'call_time' and n.reference_id = dept and n.read_boolean = false
    and n.body like team || '''s call time for ' || public.call_time_day(d) || '%';

  insert into public.notifications (user_id, type, reference_id, body)
  select p.user_id, 'call_time', dept, said
  from public.team_people(dept) p
  where p.user_id is distinct from auth.uid();
  return null;
end;
$$;

revoke all on function public.call_time_changed_notifies() from public, anon, authenticated;

drop trigger if exists call_time_changed_notifies on public.department_call_times;
create trigger call_time_changed_notifies
  after insert or update or delete on public.department_call_times
  for each row execute function public.call_time_changed_notifies();

/*
 * Remind a team of its call time on a day, or every team (dept null).
 * Not to the person pressing it, nor to anybody reminded of that day in the
 * last ten minutes.
 */
create or replace function public.remind_call_times(dept uuid, d date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
  team text;
begin
  if not public.may(auth.uid(), 'svc.call_times', dept) then
    raise exception 'Reminding % of its call time is not open to you.',
      case when dept is null then 'every team' else 'this team' end using errcode = '42501';
  end if;
  if d is null or d < (now() at time zone public.church_timezone())::date then
    raise exception 'Choose a day still to come.' using errcode = '22023';
  end if;

  if dept is not null then
    select name into team from public.departments where id = dept;
    if team is null then
      raise exception 'There is no such team.' using errcode = '22023';
    end if;
    insert into public.notifications (user_id, type, reference_id, body)
    select p.user_id, 'call_time', dept,
           format('Reminder: %s is called at %s on %s.', team, to_char(public.call_time_on(dept, d), 'HH24:MI'), public.call_time_day(d))
    from public.team_people(dept) p
    where p.user_id is distinct from auth.uid()
      and not exists (
        select 1 from public.notifications n
        where n.user_id = p.user_id and n.type = 'call_time' and n.reference_id = dept
          and n.created_at > now() - interval '10 minutes'
      );
  else
    insert into public.notifications (user_id, type, reference_id, body)
    select w.user_id, 'call_time', null, public.call_times_text(w.user_id, d)
    from (select distinct p.user_id from public.departments dp, lateral public.team_people(dp.id) p) w
    where w.user_id is distinct from auth.uid()
      and public.call_times_text(w.user_id, d) is not null
      and not exists (
        select 1 from public.notifications n
        where n.user_id = w.user_id and n.type = 'call_time' and n.reference_id is null
          and n.created_at > now() - interval '10 minutes'
      );
  end if;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.remind_call_times(uuid, date) from public, anon;
grant execute on function public.remind_call_times(uuid, date) to authenticated;

notify pgrst, 'reload schema';
