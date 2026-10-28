/*
 * Overwatch and Pastor are columns in the grid.
 *
 * Both are standings a person holds church-wide, from Volunteers, and
 * neither had a column: what Overwatch may do was five switches in
 * Settings › Overwatch (0187, app_settings.overwatch_board_posts and its
 * four neighbours), and what a Pastor may do was written into
 * prayer_pastoral() (0197). The grid could not say either, and By person
 * had to be taught both. Now each is a role in permission_roles, with
 * cells of its own.
 *
 * Overwatch's cells are its five switches, each on the row it is about:
 *
 *   msg.board_post         post on the church-wide board, as themselves
 *   msg.chat               post in any team's chat
 *   msg.polls              ask a poll, and change or remove their own
 *   issue.as_overwatch     raise an issue as Overwatch (new)
 *   debrief.as_overwatch   write Overwatch's own debrief of a service (new)
 *
 * — Everywhere or No, Everywhere out of the box, as the switches were. The
 * two new capabilities are Overwatch's alone: every other profile's cell
 * is a fixed No, so nothing may be granted of them. A switch the church had
 * turned off is carried over as that cell set to No.
 *
 * may() does not read Overwatch's cells; overwatch_may() does, as it read
 * the switches. Each is a thing done as Overwatch — on the church-wide
 * board only, as themselves, and only on a page Settings › Overwatch
 * leaves open — which no reach of may()'s says. What Overwatch reads is
 * unchanged: overwatch_sees() and that room's pages.
 *
 * A Pastor's cells are the three prayer rows (0210), fixed at Everywhere:
 * a Pastor always reads private requests, asks people to pray and runs
 * prayer lists, as before. may() gains the Pastor as a church-wide tier,
 * like an Admin's, and prayer_pastoral() asks may() alone — the Owner and
 * a Pastor pass it as they passed the old test. On every other row a
 * Pastor's cell is No: what else they may do comes from their other
 * profiles.
 *
 * Checked on production before applying, for every person: may() moved
 * only for the Pastor on the three prayer rows, which prayer_pastoral(),
 * prayer_may_assign() and prayer_may_run_lists() already gave them — and
 * those three, and overwatch_may() for each of the five, answer as before.
 *
 * The five switch columns stay, read by nothing, until a later release
 * drops them; the app stops using them with this one.
 */

insert into public.permission_roles (key, label, position, builtin) values
  ('overwatch', 'Overwatch', 7, true),
  ('pastor', 'Pastor', 8, true)
on conflict (key) do nothing;

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('msg.board_post', 'overwatch', '{none,all}', 'all'),
  ('msg.chat', 'overwatch', '{none,all}', 'all'),
  ('msg.polls', 'overwatch', '{none,all}', 'all'),
  ('issue.as_overwatch', 'admin', '{none}', 'none'),
  ('issue.as_overwatch', 'head', '{none}', 'none'),
  ('issue.as_overwatch', 'assistant', '{none}', 'none'),
  ('issue.as_overwatch', 'coordinator', '{none}', 'none'),
  ('issue.as_overwatch', 'member', '{none}', 'none'),
  ('issue.as_overwatch', 'newcomer', '{none}', 'none'),
  ('issue.as_overwatch', 'overwatch', '{none,all}', 'all'),
  ('debrief.as_overwatch', 'admin', '{none}', 'none'),
  ('debrief.as_overwatch', 'head', '{none}', 'none'),
  ('debrief.as_overwatch', 'assistant', '{none}', 'none'),
  ('debrief.as_overwatch', 'coordinator', '{none}', 'none'),
  ('debrief.as_overwatch', 'member', '{none}', 'none'),
  ('debrief.as_overwatch', 'newcomer', '{none}', 'none'),
  ('debrief.as_overwatch', 'overwatch', '{none,all}', 'all'),
  ('prayer.pastoral', 'pastor', '{all}', 'all'),
  ('prayer.assign', 'pastor', '{all}', 'all'),
  ('prayer.lists', 'pastor', '{all}', 'all')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- A switch the church turned off: that cell, at No.
insert into public.role_permissions (role_key, capability, reach)
select 'overwatch', l.cap, 'none'
from public.app_settings s
cross join lateral (values
  ('msg.board_post', s.overwatch_board_posts),
  ('msg.chat', s.overwatch_chat_posts),
  ('msg.polls', s.overwatch_polls),
  ('issue.as_overwatch', s.overwatch_issues),
  ('debrief.as_overwatch', s.overwatch_debriefs)
) l(cap, allowed)
where not l.allowed
on conflict (role_key, capability) do update set reach = excluded.reach;

create or replace function public.overwatch_may(uid uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.permission_reach('overwatch', l.cap) <> 'none' and public.overwatch_sees(uid, l.page)
    from (values
      ('board', 'msg.board_post', 'messages'),
      ('chat', 'msg.chat', 'team-chat'),
      ('polls', 'msg.polls', 'polls'),
      ('issues', 'issue.as_overwatch', 'issues'),
      ('debriefs', 'debrief.as_overwatch', 'debriefs')
    ) l(act, cap, page)
    where l.act = what
  ), false);
$$;

create or replace function public.prayer_pastoral(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and public.may(uid, 'prayer.pastoral');
$$;

create or replace function public.may(
  uid uuid,
  cap text,
  dept uuid default null,
  svc uuid default null,
  who uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  mine boolean := coalesce(who = uid, false);
  r_newcomer text;
  r_admin text;
  r_pastor text;
  r_head text;
  r_assistant text;
  r_member text;
  r_coordinator text;
begin
  if uid is null then
    return false;
  end if;

  if exists (select 1 from public.app_owner o where o.user_id = uid) then
    return true;
  end if;

  -- Every tier's reach for this capability in one read, as
  -- permission_reach() gives it: the team's own rule where the tier is one
  -- a team may set and the team has a valid one, else the church's rule
  -- where valid, else the catalog's default, else none. A Church Member and
  -- an Admin are the church's alone (a team cannot narrow its Admins).
  select
    coalesce(max(x.reach) filter (where x.role_key = 'newcomer'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'admin'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'pastor'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'head'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'assistant'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'member'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'coordinator'), 'none')
  into r_newcomer, r_admin, r_pastor, r_head, r_assistant, r_member, r_coordinator
  from (
    select c.role_key,
      coalesce(
        case when c.role_key in ('head', 'assistant', 'member', 'coordinator') then (
          select t.reach from public.department_permissions t
          where t.department_id = dept and t.role_key = c.role_key
            and t.capability = c.capability and t.reach = any (c.reaches)
        ) end,
        case when o.reach = any (c.reaches) then o.reach end,
        c.default_reach
      ) as reach
    from public.permission_catalog c
    left join public.role_permissions o
      on o.role_key = c.role_key and o.capability = c.capability
    where c.capability = cap
  ) x;

  -- Everybody signed in is a Church Member, so this needs no lookup.
  if r_newcomer = 'all' or (r_newcomer <> 'none' and mine) then
    return true;
  end if;

  if r_admin <> 'none' and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'admin'
  ) then
    if r_admin = 'all' or mine then
      return true;
    end if;
  end if;

  -- A Pastor (0214): a church-wide standing, like an Admin's, and the
  -- church's alone. Out of the box it reaches only the three prayer rows.
  if r_pastor <> 'none' and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'pastor'
  ) then
    if r_pastor = 'all' or mine then
      return true;
    end if;
  end if;

  if r_head <> 'none' and exists (
    select 1 from public.user_roles r
    where r.user_id = uid and r.role_type = 'department_head' and r.department_id is not null
  ) then
    if r_head = 'all' or mine or (r_head = 'team' and dept is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = uid and r.department_id = dept and r.role_type = 'department_head'
    )) then
      return true;
    end if;
  end if;

  if r_assistant <> 'none' and exists (
    select 1 from public.user_roles r
    where r.user_id = uid and r.role_type = 'assisting_head' and r.department_id is not null
  ) then
    if r_assistant = 'all' or mine or (r_assistant = 'team' and dept is not null and exists (
      select 1 from public.user_roles r
      where r.user_id = uid and r.department_id = dept and r.role_type = 'assisting_head'
    )) then
      return true;
    end if;
  end if;

  if r_member <> 'none' then
    if r_member = 'team' and dept is not null and exists (
      select 1 from public.department_members m where m.department_id = dept and m.user_id = uid
    ) then
      return true;
    end if;
    if (r_member = 'all' or mine)
       and exists (select 1 from public.department_members m where m.user_id = uid) then
      return true;
    end if;
  end if;

  if r_coordinator <> 'none' then
    if r_coordinator in ('team', 'all') and svc is not null and dept is not null and exists (
      select 1 from public.rota_assignments a
      where a.service_id = svc and a.department_id = dept and a.user_id = uid
        and lower(btrim(a.role_label)) in ('coordinator', 'team coordinator')
    ) then
      return true;
    end if;
    if (r_coordinator = 'all' or mine) and exists (
      select 1 from public.rota_assignments a
      where a.user_id = uid and lower(btrim(a.role_label)) in ('coordinator', 'team coordinator')
    ) then
      return true;
    end if;
  end if;

  -- Given one thing more (0208): this person by name, or everybody on a
  -- team (its roster, its Head and Assisting Heads — or, since 0213, only
  -- its Head and Assisting Heads), may do this —
  -- everywhere, or on the teams they are on. Asked last, so a grant only
  -- ever adds to what the grid gives; with none, every answer is as it was.
  if exists (
    select 1 from public.permission_grants g
    where g.capability = cap
      and (
        g.user_id = uid
        or (g.department_id is not null and (
          (not g.leads_only and exists (
            select 1 from public.department_members m where m.department_id = g.department_id and m.user_id = uid
          ))
          or exists (
            select 1 from public.user_roles r
            where r.user_id = uid and r.department_id = g.department_id
              and r.role_type in ('department_head', 'assisting_head')
          )
        ))
      )
      and (
        g.reach = 'all'
        or mine
        or (dept is not null and (
          g.department_id = dept
          or (g.user_id is not null and (
            exists (select 1 from public.department_members m where m.department_id = dept and m.user_id = uid)
            or exists (
              select 1 from public.user_roles r
              where r.user_id = uid and r.department_id = dept
                and r.role_type in ('department_head', 'assisting_head')
            )
          ))
        ))
      )
  ) then
    return true;
  end if;

  return false;
end;
$$;
