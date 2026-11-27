/*
 * The On my way page: every team's arrivals, for whoever runs the day.
 *
 * On my way (0337) shows somebody their own team on the Dashboard. The
 * Owner asked for a page, like the Clock In page, where the Owner, the
 * Admins, a Pastor and Overwatch see every team at once: who is here, who
 * is on the way and when, who cannot make it, and who has said nothing
 * (27 November 2026). Who else may open it is the church's to say later:
 * "We can later control in settings which team or people or groups etc
 * can access this page".
 *
 * So it is a page with a level, like the others since 0277: a row in the
 * grid, `page.on_my_way`, which can_open_page() already asks may() for,
 * so a grant to a team or a person opens it too. Out of the box: the
 * Admins and a Pastor (the Owner always). Overwatch opens it through
 * Settings › Overwatch, where a page nobody has closed is open.
 *
 * team_arrivals() gave every team to whoever may see clock-ins. It now
 * gives every team to whoever may open this page, and everybody else
 * their own: what Clock In shows and what this shows are separate
 * choices. Nothing else in it changes.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('page.on_my_way', 'admin', '{none,all}', 'all'),
  ('page.on_my_way', 'head', '{none,all}', 'none'),
  ('page.on_my_way', 'assistant', '{none,all}', 'none'),
  ('page.on_my_way', 'coordinator', '{none}', 'none'),
  ('page.on_my_way', 'member', '{none,all}', 'none'),
  ('page.on_my_way', 'newcomer', '{none}', 'none'),
  ('page.on_my_way', 'pastor', '{none,all}', 'all')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

CREATE OR REPLACE FUNCTION public.team_arrivals()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Every team is the On my way page's (0338): whoever may open it. Everybody else, their own.
  sees_all := public.can_open_page(uid, 'on-my-way');

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

-- What the page falls back on without its row, as every page has said since 0277.
create or replace function public.page_level(page text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case page
    when 'service-planner' then 'everyone'
    when 'set-lists'       then 'everyone'
    when 'updates'         then 'everyone'
    when 'polls'           then 'everyone'
    when 'events'          then 'everyone'
    when 'giving'          then 'everyone'
    when 'stage'           then 'everyone'
    when 'prayer'          then 'everyone'
    when 'songs'           then 'everyone'
    -- Volunteers starts as the Admins' alone.
    when 'volunteers'      then 'admins'
    -- Every team's arrivals (0338): the Admins' too. Unused while its row is in the grid, as every page's is.
    when 'on-my-way'       then 'admins'
    -- Teams, from here on, is for people on a team.
    else 'team'
  end;
$function$;

revoke all on function public.team_arrivals() from public, anon;
grant execute on function public.team_arrivals() to authenticated;

notify pgrst, 'reload schema';
select public.migration_done(338, '0338_the_on_my_way_page', 'cc9d35cfc2daf87d32039e8f145c38f4796791862618a8a5d426420d9d75e8a4');
