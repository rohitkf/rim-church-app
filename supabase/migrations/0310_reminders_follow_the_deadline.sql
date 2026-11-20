/*
 * The reminder follows the deadline, the head is told when it passes, and
 * one service can have a deadline of its own (asked for by the Owner,
 * November 2026, after 0309 let answers close hours before a service).
 *
 * Four things were wrong or missing round that deadline.
 *
 * 1. The reminder went by the calendar, not by the deadline.
 *    "You have not answered" was sent at 19:00 UTC on Fridays and
 *    Saturdays, which fits a Sunday service that closes on Saturday night
 *    and nothing else. A Friday service had closed on Thursday night
 *    before the Friday reminder ran: nobody was reminded for it at all.
 *    A Wednesday service was never reminded either. Now it is sent
 *    availability_reminder_hours before answers close, for every service,
 *    whichever way the deadline is said (24 out of the box; 0 is never).
 *
 * 2. The reminder never said when answers close. It does now.
 *
 * 3. Nobody told the head. When answers closed the team's Head had to
 *    open the tracker to learn who never answered. Now the Head and the
 *    Assisting Heads are told once, when answers close: how the team
 *    answered and who did not. A new notification type,
 *    availability_closed — it buzzes a pocket, and it is meant to; the
 *    church can turn it off (availability_closed_notice).
 *
 * 4. Every service had the church's one rule. A conference that should
 *    close two days ahead and a Sunday that closes the night before could
 *    not both be said. services.availability_closes_override is a moment
 *    of that service's own; where it is set it is the deadline, and
 *    availability_closes_at() says so to everything that asks.
 *
 * And answers may now close when the service begins: 0 hours before.
 *
 * Nobody is woken. Both messages keep to the church's waking hours, 08:00
 * to 21:00 on its own clock: a reminder that falls in the night goes at
 * 20:00 the evening before it, and a head's summary that falls in the
 * night waits for 08:00. The job runs on the hour.
 *
 * The app already in production reads none of the new columns, and the
 * deadline it works out is unchanged until somebody sets an override or
 * chooses 0 hours — which only the app that ships with this can.
 */

-- ---------------------------------------------------------------------------
-- What is kept
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists availability_reminder_hours integer not null default 24
    constraint app_settings_availability_reminder_hours_check check (availability_reminder_hours between 0 and 168),
  add column if not exists availability_closed_notice boolean not null default true;

comment on column public.app_settings.availability_reminder_hours is
  'Hours before availability answers close that whoever has not answered is reminded. 0: never. Sent in waking hours (08:00–21:00 church time): one that falls in the night goes at 20:00 the evening before.';
comment on column public.app_settings.availability_closed_notice is
  'Whether a team''s Head and Assisting Heads are told, when answers close for a service, how their team answered and who did not.';

-- When the service begins, too: 0 hours before.
alter table public.app_settings drop constraint if exists app_settings_availability_closes_hours_check;
alter table public.app_settings
  add constraint app_settings_availability_closes_hours_check check (availability_closes_hours between 0 and 168);

alter table public.services
  add column if not exists availability_closes_override timestamptz,
  add column if not exists availability_closed_told_at timestamptz;

comment on column public.services.availability_closes_override is
  'When availability answers close for this service, if not by the church''s rule. Null: the rule (app_settings.availability_closes_*). Written by whoever may manage services. Read by availability_closes_at().';
comment on column public.services.availability_closed_told_at is
  'When the heads were told that answers had closed for this service. Kept so they are told once; a deadline moved to later than this tells them again when it passes.';

-- ---------------------------------------------------------------------------
-- The deadline: the service's own, or the church's rule
-- ---------------------------------------------------------------------------

create or replace function public.availability_closes_at(svc_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    s.availability_closes_override,
    case
      -- Hours before it begins, where it has a beginning. The running order
      -- is only looked at in this mode: this is asked for every row a policy
      -- reads, and the night-before rule needs nothing but the date.
      when a.availability_closes_mode = 'hours' then
        coalesce(
          (select min(ss.start_time) from public.service_sessions ss where ss.service_id = s.id)
            - make_interval(hours => a.availability_closes_hours),
          ((s.date - 1) + coalesce(a.availability_closes_time, time '23:59')) at time zone public.church_timezone()
        )
      else ((s.date - 1) + coalesce(a.availability_closes_time, time '23:59')) at time zone public.church_timezone()
    end
  )
  from public.services s
  left join public.app_settings a on true
  where s.id = svc_id;
$$;

-- ---------------------------------------------------------------------------
-- Waking hours, on the church's clock
-- ---------------------------------------------------------------------------

/** Whether it is between 08:00 and 21:00 where the church is. */
create or replace function public.church_is_awake(moment timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select extract(hour from moment at time zone public.church_timezone()) between 8 and 20;
$$;

/**
 * A moment, kept out of the night. One between 21:00 and 08:00 becomes
 * 20:00 the evening before it (`lean` 'earlier': a reminder has to arrive
 * while there is still time to act on it) or 08:00 the morning after
 * (`lean` 'later': a summary of what has happened can wait for daylight).
 */
create or replace function public.church_waking_moment(moment timestamptz, lean text)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  with l as (select moment at time zone public.church_timezone() as local)
  select (case
    when extract(hour from l.local) between 8 and 20 then l.local
    when lean = 'earlier' then
      date_trunc('day', l.local) - (case when extract(hour from l.local) < 8 then interval '1 day' else interval '0' end) + interval '20 hours'
    else
      date_trunc('day', l.local) + (case when extract(hour from l.local) >= 21 then interval '1 day' else interval '0' end) + interval '8 hours'
  end) at time zone public.church_timezone()
  from l;
$$;

revoke all on function public.church_is_awake(timestamptz) from public, anon;
revoke all on function public.church_waking_moment(timestamptz, text) from public, anon;
grant execute on function public.church_is_awake(timestamptz) to authenticated;
grant execute on function public.church_waking_moment(timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The reminder: before the deadline, and saying when it is
-- ---------------------------------------------------------------------------

create or replace function public.availability_reminder_text(uid uuid, svc uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  with waiting as (
    select d.name
    from public.department_members m
    join public.departments d on d.id = m.department_id
    where m.user_id = uid
      and m.member_type = 'core'
      and not exists (
        select 1 from public.availability a
        where a.user_id = uid and a.department_id = m.department_id and a.service_id = svc
      )
  ), named as (
    select count(*) as n,
           array_agg(name order by name) as names
    from waiting
  )
  select case when named.n = 0 then null else
    format(
      'Can you serve at the %s on %s? %s %s waiting on your %s.%s',
      s.service_type,
      to_char(s.date, 'FMDay FMDD FMMonth'),
      case when named.n = 1 then named.names[1]
           else array_to_string(named.names[1:named.n - 1], ', ') || ' and ' || named.names[named.n] end,
      case when named.n = 1 then 'is' else 'are' end,
      case when named.n = 1 then 'answer' else 'answers' end,
      -- When, on the church's clock: a deadline nobody is told is one they miss.
      coalesce(' Answers close ' || to_char(public.availability_closes_at(svc) at time zone public.church_timezone(), 'FMDay "at" HH24:MI') || '.', '')
    ) end
  from named, public.services s
  where s.id = svc;
$$;

create or replace function public.remind_unanswered_availability()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  total integer := 0;
  sent integer;
  svc record;
  ahead integer := coalesce((select availability_reminder_hours from public.app_settings limit 1), 24);
  today date := (now() at time zone public.church_timezone())::date;
begin
  -- Never, or not now: nobody's phone goes in the night.
  if ahead = 0 or not public.church_is_awake() then
    return 0;
  end if;
  for svc in
    select s.id from public.services s
    -- A deadline is at most a week before its service and a reminder at
    -- most a week before that: nothing further out can be due.
    where s.date >= today and s.date <= today + 15
      and not public.availability_is_closed(s.id)
      and public.church_waking_moment(public.availability_closes_at(s.id) - make_interval(hours => ahead), 'earlier') <= now()
  loop
    insert into public.notifications (user_id, type, reference_id, body)
    select w.user_id, 'availability_reminder', svc.id, public.availability_reminder_text(w.user_id, svc.id)
    from (
      select distinct m.user_id
      from public.department_members m
      where m.member_type = 'core'
        and not exists (
          select 1 from public.availability a
          where a.user_id = m.user_id
            and a.department_id = m.department_id
            and a.service_id = svc.id
        )
    ) w
    where public.can_open_page(w.user_id, 'availability')
      and not exists (
        select 1 from public.notifications n
        where n.user_id = w.user_id
          and n.type = 'availability_reminder'
          and n.reference_id = svc.id
          and (n.read_boolean = false or n.created_at > now() - interval '6 days')
      );
    get diagnostics sent = row_count;
    total := total + sent;
  end loop;
  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- The heads are told when answers close
-- ---------------------------------------------------------------------------

/** One team's answers for one service, as a head would be told them. Null for a team that asks nobody. */
create or replace function public.availability_closed_line(dept uuid, svc uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  with asked as (
    select m.user_id,
           coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Somebody') as name,
           (select a.status::text from public.availability a
             where a.user_id = m.user_id and a.department_id = m.department_id and a.service_id = svc) as said
    from public.department_members m
    left join public.profiles p on p.id = m.user_id
    where m.department_id = dept and m.member_type = 'core'
  ), counted as (
    select count(*) as n,
           count(*) filter (where said = 'available') as yes,
           count(*) filter (where said = 'tentative') as maybe,
           count(*) filter (where said = 'unavailable') as no,
           count(*) filter (where said is null) as silent,
           array_agg(name order by name) filter (where said is null) as names
    from asked
  )
  select case when c.n = 0 then null else
    (select d.name from public.departments d where d.id = dept) || ': '
      || c.yes || ' yes'
      || case when c.maybe > 0 then ', ' || c.maybe || ' maybe' else '' end
      || ', ' || c.no || ' no'
      || case when c.silent = 0 then ', everybody answered'
              else ', ' || c.silent || ' not answered ('
                || array_to_string(c.names[1:5], ', ')
                || case when c.silent > 5 then ' and ' || (c.silent - 5) || ' more' else '' end || ')' end
      || '.' end
  from counted c;
$$;

revoke all on function public.availability_closed_line(uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_availability_closed()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  total integer := 0;
  sent integer;
  svc record;
begin
  if not coalesce((select availability_closed_notice from public.app_settings limit 1), true)
     or not public.church_is_awake() then
    return 0;
  end if;
  for svc in
    select s.id, s.service_type, s.date, public.availability_closes_at(s.id) as closed
    from public.services s
    where public.availability_closes_at(s.id) <= now()
      -- Only a deadline that has just passed: not every service there has ever been.
      and public.availability_closes_at(s.id) > now() - interval '24 hours'
      and public.church_waking_moment(public.availability_closes_at(s.id), 'later') <= now()
      and not public.service_has_finished(s.id)
      -- Once; again only if the deadline was moved to after they were told.
      and (s.availability_closed_told_at is null or s.availability_closed_told_at < public.availability_closes_at(s.id))
  loop
    insert into public.notifications (user_id, type, reference_id, body)
    select h.user_id, 'availability_closed', svc.id,
           'Answers have closed for the ' || svc.service_type || ' on ' || to_char(svc.date, 'FMDay FMDD FMMonth') || '. ' || h.said
    from (
      select ur.user_id, string_agg(public.availability_closed_line(ur.department_id, svc.id), ' ' order by d.name) as said
      from (select distinct user_id, department_id from public.user_roles
             where role_type in ('department_head', 'assisting_head') and department_id is not null) ur
      join public.departments d on d.id = ur.department_id
      where public.availability_closed_line(ur.department_id, svc.id) is not null
      group by ur.user_id
    ) h
    where public.can_open_page(h.user_id, 'availability');
    get diagnostics sent = row_count;
    total := total + sent;
    update public.services set availability_closed_told_at = now() where id = svc.id;
  end loop;
  return total;
end;
$$;

revoke all on function public.notify_availability_closed() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- On the hour, in place of Fridays and Saturdays at seven
-- ---------------------------------------------------------------------------

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'rim-availability-reminder';
    perform cron.schedule('rim-availability-reminder', '0 * * * *',
      'select public.remind_unanswered_availability(); select public.notify_availability_closed();');
  end if;
end;
$cron$;
select public.migration_done(310, '0310_reminders_follow_the_deadline', '1593586bb9c581d28514a41882a0150b953cbb22afb6d34ab83e540ab10a6bb5');
