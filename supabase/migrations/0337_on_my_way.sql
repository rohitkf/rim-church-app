/*
 * On my way.
 *
 * A team is called for seven. At seven some of it is in the building and
 * some is not, and the ones who are there do not know whether the rest
 * are five minutes off, half an hour off, or not coming (a suggestion put
 * to the Owner, 27 November 2026: "get the location of that team member
 * [...] an estimated time of arrival").
 *
 * What is kept is the answer, never the place. Somebody due in says "on
 * my way" with a number of minutes — worked out on their phone from the
 * rounded distance clock_in_where_am_i() already gives, or chosen by hand
 * — or says they cannot make it. One row a person a day: a time, and how
 * it was arrived at. No latitude, no longitude, no distance.
 *
 * Who reads it: the people on that team that day, the team's Head and
 * Assisting Heads, and whoever may already see clock-ins. They see each
 * person as here, on the way with a time, not coming, or no word. "Here"
 * is a clock-in (or a request to be clocked in) with no time on it: when
 * somebody arrived stays the Clock In page's.
 *
 * At the call time, anybody on the rota who has not clocked in and has
 * said nothing is asked once. A Head is told when somebody says they
 * cannot make it, and again if they then come after all.
 *
 * The church can switch all of it off: app_settings.clock_in_on_my_way,
 * which app_setting_rooms() already files under Settings › Clock In by
 * its name. The rows go overnight.
 */

-- 1 -- the switch, and where a word is kept ---------------------------------
alter table public.app_settings
  add column if not exists clock_in_on_my_way boolean not null default true;
comment on column public.app_settings.clock_in_on_my_way is
  'On my way (0337): people due in can tell their team when they will arrive, and are asked at their call time. Off: nobody is asked and nothing is shown.';

create table if not exists public.on_my_way (
  user_id uuid not null references public.profiles(id) on delete cascade,
  on_date date not null,
  /* Null: asked, and has not answered. */
  word text check (word in ('coming', 'not_coming')),
  /* When they expect to be there. Theirs to say: an estimate, never a reading. */
  eta_at timestamptz,
  /* How the time was arrived at: worked out from how far away the phone was, or chosen. */
  how text check (how in ('estimate', 'chosen')),
  said_at timestamptz,
  /* When the app asked them, at their call time. Once a day. */
  asked_at timestamptz,
  /* How many times their Heads have been told of a change today: a cap, so a word flipped back and forth is not a stream of pushes. */
  heads_told integer not null default 0,
  primary key (user_id, on_date),
  constraint on_my_way_a_time_goes_with_coming check ((word is not distinct from 'coming') = (eta_at is not null))
);
comment on table public.on_my_way is
  'What somebody due in has said about arriving today (0337): coming, with a time, or not coming. Never where they are. Deleted overnight.';

alter table public.on_my_way enable row level security;
revoke all on public.on_my_way from anon, authenticated;
grant select on public.on_my_way to authenticated;
-- Their own row only. A team reads each other's through team_arrivals(), which decides who is on the team.
drop policy if exists "A person reads their own word" on public.on_my_way;
create policy "A person reads their own word" on public.on_my_way
  for select to authenticated using (user_id = (select auth.uid()));

-- 2 -- who is told when somebody is not coming -------------------------------
create or replace function public.on_my_way_tell_heads(uid uuid, on_day date, says text)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  told integer;
begin
  -- The teams they are down for today; with no place on the rota, the teams they are on.
  with teams as (
    select distinct d.department_id from public.clock_in_duties(uid, on_day) d
  ),
  theirs as (
    select department_id from teams
    union
    select t.department_id from public.clock_in_member_teams(uid) t
    where not exists (select 1 from teams)
  )
  insert into public.notifications (user_id, type, reference_id, body)
  select distinct r.user_id, 'on_my_way_change', null::uuid, says
  from theirs
  join public.user_roles r
    on r.department_id = theirs.department_id
   and r.role_type in ('department_head', 'assisting_head')
  where r.user_id <> uid;
  get diagnostics told = row_count;
  return told;
end;
$function$;

-- 3 -- saying it -------------------------------------------------------------
create or replace function public.on_my_way_say(p_word text, p_minutes integer default null, p_how text default 'chosen')
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  today date := public.church_today();
  before public.on_my_way%rowtype;
  after public.on_my_way%rowtype;
  who text;
  teams text;
  eta timestamptz;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not coalesce((select clock_in_on_my_way from public.app_settings limit 1), true) then
    raise exception 'The church has switched this off.';
  end if;
  if p_word is null or p_word not in ('coming', 'not_coming') then
    raise exception 'Say whether you are coming.';
  end if;
  -- The same people who are given the Clock in button (0227): anybody on a team, on a day with a service.
  if public.clock_in_first_call(uid, today) is null then
    raise exception 'You are not due in today.';
  end if;
  if now() >= public.clock_in_day_ends(today) then
    raise exception 'Today''s services are over.';
  end if;
  if exists (select 1 from public.clock_ins c where c.user_id = uid and c.on_date = today) then
    raise exception 'You have already clocked in.';
  end if;
  if p_word = 'coming' then
    if p_minutes is null or p_minutes < 0 or p_minutes > 240 then
      raise exception 'Choose how many minutes away you are, up to four hours.';
    end if;
    -- To the minute: nobody's arrival is known to the second.
    eta := date_trunc('minute', now() + make_interval(mins => p_minutes) + interval '30 seconds');
  end if;

  select * into before from public.on_my_way w where w.user_id = uid and w.on_date = today for update;

  insert into public.on_my_way (user_id, on_date, word, eta_at, how, said_at)
  values (uid, today, p_word, eta, case when p_word = 'coming' then case when p_how = 'estimate' then 'estimate' else 'chosen' end end, now())
  on conflict (user_id, on_date) do update
    set word = excluded.word, eta_at = excluded.eta_at, how = excluded.how, said_at = excluded.said_at
  returning * into after;

  -- Their Heads hear of "not coming", and of a change of mind after it. Three times a day at most.
  if after.heads_told < 3
     and ((p_word = 'not_coming' and before.word is distinct from 'not_coming')
          or (p_word = 'coming' and before.word = 'not_coming')) then
    select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Somebody')
      into who from public.profiles p where p.id = uid;
    select string_agg(distinct d.name, ', ' order by d.name) into teams
      from public.clock_in_duties(uid, today) cd join public.departments d on d.id = cd.department_id;
    perform public.on_my_way_tell_heads(uid, today,
      who
      || case when p_word = 'not_coming' then ' cannot make it today'
              else ' is coming after all, about ' || to_char(eta at time zone public.church_timezone(), 'HH24:MI') end
      || case when teams is null then '.' else ' (' || teams || ').' end);
    update public.on_my_way set heads_told = heads_told + 1 where user_id = uid and on_date = today;
  end if;

  return jsonb_build_object('word', after.word, 'eta_at', after.eta_at, 'how', after.how, 'said_at', after.said_at);
end;
$function$;

-- 4 -- reading a team's -------------------------------------------------------
create or replace function public.team_arrivals()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  today date := public.church_today();
  switched_on boolean := coalesce((select clock_in_on_my_way from public.app_settings limit 1), true);
  first_call timestamptz;
  mine public.on_my_way%rowtype;
  sees_all boolean;
  teams jsonb;
begin
  if uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not switched_on or not exists (select 1 from public.services s where s.date = today) then
    return jsonb_build_object('on', switched_on, 'on_date', today, 'due', false, 'teams', '[]'::jsonb);
  end if;

  first_call := public.clock_in_first_call(uid, today);
  select * into mine from public.on_my_way w where w.user_id = uid and w.on_date = today;
  sees_all := public.may_see_clock_ins(uid);

  with duties as (
    select distinct d.user_id, d.department_id, d.call_at from public.clock_in_day_duties(today) d
  ),
  -- The teams this person may read: one they are down for today, one they are on or head, or every one for whoever sees clock-ins.
  my_teams as (
    select d.department_id, true as on_duty from duties d where d.user_id = uid
    union
    select t.department_id, false from public.clock_in_member_teams(uid) t
  ),
  readable as (
    select dep.id, dep.name, dep.color,
           coalesce(bool_or(mt.on_duty), false) as on_duty,
           (count(mt.department_id) > 0) as mine
    from public.departments dep
    left join my_teams mt on mt.department_id = dep.id
    where exists (select 1 from duties d where d.department_id = dep.id)
      and (sees_all or mt.department_id is not null)
    group by dep.id, dep.name, dep.color
  ),
  -- Who is expected on each: whoever is down for it, and anybody on the team who has turned up or said something.
  on_team as (
    select m.department_id, m.user_id from public.department_members m
    union
    select r.department_id, r.user_id from public.user_roles r
    where r.department_id is not null and r.role_type in ('department_head', 'assisting_head')
  ),
  people as (
    select d.department_id, d.user_id, true as on_rota from duties d
    union
    select m.department_id, m.user_id, false
    from on_team m
    where exists (select 1 from duties d where d.department_id = m.department_id)
      and not exists (select 1 from duties d where d.department_id = m.department_id and d.user_id = m.user_id)
      and (exists (select 1 from public.clock_ins c where c.user_id = m.user_id and c.on_date = today)
           or exists (select 1 from public.on_my_way w where w.user_id = m.user_id and w.on_date = today and w.word is not null))
  ),
  rows as (
    select p.department_id, p.user_id, p.on_rota, pr.first_name, pr.last_name,
      case
        when exists (select 1 from public.clock_ins c where c.user_id = p.user_id and c.on_date = today) then 'here'
        when exists (select 1 from public.clock_in_requests r where r.user_id = p.user_id and r.on_date = today and r.status = 'pending') then 'here'
        when w.word = 'coming' then 'coming'
        when w.word = 'not_coming' then 'not_coming'
        else 'none'
      end as state,
      w.eta_at, w.said_at
    from people p
    join public.profiles pr on pr.id = p.user_id
    left join public.on_my_way w on w.user_id = p.user_id and w.on_date = today
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'color', r.color, 'mine', r.mine, 'on_duty', r.on_duty,
      'call_at', ((today + coalesce((select ct.call_time from public.department_call_times ct where ct.department_id = r.id and ct.on_date = today), time '07:00')) at time zone public.church_timezone()),
      'people', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', x.user_id, 'first_name', x.first_name, 'last_name', x.last_name, 'on_rota', x.on_rota,
            'state', x.state,
            -- A time only while it is still a promise: once they are here it is the Clock In page's.
            'eta_at', case when x.state = 'coming' then x.eta_at end,
            'said_at', case when x.state in ('coming', 'not_coming') then x.said_at end
          ) order by x.first_name, x.last_name, x.user_id), '[]'::jsonb)
        from rows x where x.department_id = r.id
      )
    ) order by r.name), '[]'::jsonb)
  into teams
  from readable r;

  return jsonb_build_object(
    'on', true,
    'on_date', today,
    'due', first_call is not null,
    'first_call', first_call,
    'closes_at', public.clock_in_day_ends(today),
    'clocked', exists (select 1 from public.clock_ins c where c.user_id = uid and c.on_date = today),
    'word', mine.word,
    'eta_at', mine.eta_at,
    'said_at', mine.said_at,
    'sees_all', sees_all,
    'teams', teams
  );
end;
$function$;

-- 5 -- asking, at the call time ----------------------------------------------
create or replace function public.send_on_my_way_asks()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  today date := public.church_today();
  sent integer;
begin
  if not coalesce((select clock_in_on_my_way from public.app_settings limit 1), true) then return 0; end if;
  -- Without the church's place nobody can clock in, and "you have not clocked in" would be said to everybody.
  if not exists (select 1 from public.clock_in_place) then return 0; end if;
  with due as (
    select d.user_id, min(d.call_at) as first_call
    from public.clock_in_day_duties(today) d
    group by d.user_id
  ),
  out_now as (
    select due.user_id, due.first_call from due
    where now() >= due.first_call
      and now() < due.first_call + interval '20 minutes'
      and now() < public.clock_in_day_ends(today)
      and not exists (select 1 from public.clock_ins c where c.user_id = due.user_id and c.on_date = today)
      and not exists (select 1 from public.clock_in_requests r where r.user_id = due.user_id and r.on_date = today and r.status in ('pending', 'approved'))
      and not exists (select 1 from public.on_my_way w where w.user_id = due.user_id and w.on_date = today and (w.word is not null or w.asked_at is not null))
  ),
  marked as (
    insert into public.on_my_way (user_id, on_date, asked_at)
    select user_id, today, now() from out_now
    on conflict (user_id, on_date) do update set asked_at = now() where public.on_my_way.asked_at is null and public.on_my_way.word is null
    returning user_id
  )
  insert into public.notifications (user_id, type, reference_id, body)
  select m.user_id, 'on_my_way_ask', null::uuid,
    'You were called for ' || to_char(o.first_call at time zone public.church_timezone(), 'HH24:MI')
      || ' and have not clocked in. Tell your team when you will be there.'
  from marked m join out_now o on o.user_id = m.user_id;
  get diagnostics sent = row_count;
  return sent;
end;
$function$;

-- 6 -- gone overnight ---------------------------------------------------------
create or replace function public.delete_old_on_my_way()
returns void
language sql
security definer
set search_path = public
as $function$
  delete from public.on_my_way where on_date < public.church_today();
$function$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('on-my-way-asks', 'delete-old-on-my-way');
    perform cron.schedule('on-my-way-asks', '* * * * *', 'select public.send_on_my_way_asks()');
    perform cron.schedule('delete-old-on-my-way', '40 2 * * *', 'select public.delete_old_on_my_way()');
  end if;
end;
$cron$;

-- 7 -- who may call what -------------------------------------------------------
revoke all on function public.on_my_way_tell_heads(uuid, date, text) from public, anon, authenticated;
revoke all on function public.send_on_my_way_asks() from public, anon, authenticated;
revoke all on function public.delete_old_on_my_way() from public, anon, authenticated;
revoke all on function public.on_my_way_say(text, integer, text) from public, anon;
grant execute on function public.on_my_way_say(text, integer, text) to authenticated;
revoke all on function public.team_arrivals() from public, anon;
grant execute on function public.team_arrivals() to authenticated;
comment on function public.on_my_way_say(text, integer, text) is
  'Somebody due in today says they are on the way (with how many minutes) or not coming. Keeps a time, never a place (0337).';
comment on function public.team_arrivals() is
  'Today''s teams the caller is on, heads, or may see clock-ins for: each person as here, coming (with a time), not coming or no word (0337).';

notify pgrst, 'reload schema';
select public.migration_done(337, '0337_on_my_way', 'f0b85c40311efa8ca9b56e9d9c22f973fd814adafff21ddfab49e0616a0ce4da');
