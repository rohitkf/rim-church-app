/*
 * Overwatch has a cell on every row too (asked for by the Owner, November
 * 2026: no dashes, for anyone).
 *
 * Overwatch sees every team and changes almost nothing (0187): its column
 * was five cells, the things it does as Overwatch, read by
 * overwatch_may() — and may() never asked Overwatch anything, so no other
 * cell could be offered. Now may() reads Overwatch as it reads a Pastor
 * (0214): a church-wide standing, with a cell on every row the church may
 * set to No or Everywhere. Every new cell starts at No, so Overwatch may
 * do exactly what it could before until a cell is changed.
 *
 * The five cells there already were are untouched and still
 * overwatch_may()'s alone: may() skips them by name, because each is done
 * as Overwatch, only on a page Settings › Overwatch leaves open, which no
 * reach says.
 *
 * Rows without an Overwatch cell, on purpose: the grid itself
 * (app.permissions), and what Overwatch already reads through its own
 * room — every page's opening (page.*), the clock-ins (clockin.view) and
 * the availability history (avail.history) — where a cell saying No would
 * be untrue.
 *
 * may() is otherwise 0218's, line for line. Checked on production before
 * applying: for every person and every capability, may() answers as it
 * did.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('rota.assign', 'overwatch', '{none,all}', 'none'),
  ('rota.tag', 'overwatch', '{none,all}', 'none'),
  ('rota.release_ask', 'overwatch', '{none,all}', 'none'),
  ('rota.release_decide', 'overwatch', '{none,all}', 'none'),
  ('rota.release_delete', 'overwatch', '{none,all}', 'none'),
  ('svc.manage', 'overwatch', '{none,all}', 'none'),
  ('svc.templates', 'overwatch', '{none,all}', 'none'),
  ('svc.sessions', 'overwatch', '{none,all}', 'none'),
  ('svc.guests', 'overwatch', '{none,all}', 'none'),
  ('svc.repeat', 'overwatch', '{none,all}', 'none'),
  ('svc.events', 'overwatch', '{none,all}', 'none'),
  ('svc.call_times', 'overwatch', '{none,all}', 'none'),
  ('team.create', 'overwatch', '{none,all}', 'none'),
  ('team.edit', 'overwatch', '{none,all}', 'none'),
  ('clockin.approve', 'overwatch', '{none,all}', 'none'),
  ('prayer.pastoral', 'overwatch', '{none,all}', 'none'),
  ('prayer.assign', 'overwatch', '{none,all}', 'none'),
  ('prayer.lists', 'overwatch', '{none,all}', 'none'),
  ('planner.start', 'overwatch', '{none,all}', 'none'),
  ('planner.hold', 'overwatch', '{none,all}', 'none'),
  ('planner.add_time', 'overwatch', '{none,all}', 'none'),
  ('planner.skip', 'overwatch', '{none,all}', 'none'),
  ('planner.substitute', 'overwatch', '{none,all}', 'none'),
  ('planner.add_below', 'overwatch', '{none,all}', 'none'),
  ('planner.remove', 'overwatch', '{none,all}', 'none'),
  ('planner.end', 'overwatch', '{none,all}', 'none'),
  ('stage.add', 'overwatch', '{none,all}', 'none'),
  ('stage.edit', 'overwatch', '{none,all}', 'none'),
  ('stage.delete', 'overwatch', '{none,all}', 'none'),
  ('stage.comment', 'overwatch', '{none,all}', 'none'),
  ('stage.templates', 'overwatch', '{none,all}', 'none'),
  ('team.request_join', 'overwatch', '{none,all}', 'none'),
  ('team.members', 'overwatch', '{none,all}', 'none'),
  ('team.roles', 'overwatch', '{none,all}', 'none'),
  ('team.groups', 'overwatch', '{none,all}', 'none'),
  ('team.checklists', 'overwatch', '{none,all}', 'none'),
  ('team.join', 'overwatch', '{none,all}', 'none'),
  ('day.verify', 'overwatch', '{none,all}', 'none'),
  ('day.check_all', 'overwatch', '{none,all}', 'none'),
  ('day.ready', 'overwatch', '{none,all}', 'none'),
  ('day.attendance', 'overwatch', '{none,all}', 'none'),
  ('day.nudge', 'overwatch', '{none,all}', 'none'),
  ('avail.edit_others', 'overwatch', '{none,all}', 'none'),
  ('avail.add_others', 'overwatch', '{none,all}', 'none'),
  ('avail.late_decide', 'overwatch', '{none,all}', 'none'),
  ('avail.nudge', 'overwatch', '{none,all}', 'none'),
  ('inv.items', 'overwatch', '{none,all}', 'none'),
  ('inv.stock', 'overwatch', '{none,all}', 'none'),
  ('inv.purchase_ask', 'overwatch', '{none,all}', 'none'),
  ('inv.purchase_decide', 'overwatch', '{none,all}', 'none'),
  ('msg.board_moderate', 'overwatch', '{none,all}', 'none'),
  ('msg.chat_moderate', 'overwatch', '{none,all}', 'none'),
  ('msg.updates', 'overwatch', '{none,all}', 'none'),
  ('msg.alert_team', 'overwatch', '{none,all}', 'none'),
  ('msg.alert', 'overwatch', '{none,all}', 'none'),
  ('issue.mark', 'overwatch', '{none,all}', 'none'),
  ('issue.delete', 'overwatch', '{none,all}', 'none'),
  ('songs.edit', 'overwatch', '{none,all}', 'none'),
  ('reg.manage', 'overwatch', '{none,all}', 'none'),
  ('countdown.view', 'overwatch', '{none,all}', 'none'),
  ('reg.door', 'overwatch', '{none,all}', 'none'),
  ('reg.view', 'overwatch', '{none,all}', 'none'),
  ('reg.verify', 'overwatch', '{none,all}', 'none'),
  ('reg.door_view', 'overwatch', '{none,all}', 'none'),
  ('reg.edit', 'overwatch', '{none,all}', 'none'),
  ('reg.approve', 'overwatch', '{none,all}', 'none'),
  ('reg.refund', 'overwatch', '{none,all}', 'none'),
  ('reg.cancel', 'overwatch', '{none,all}', 'none'),
  ('reg.door_pay', 'overwatch', '{none,all}', 'none'),
  ('reg.walk_in', 'overwatch', '{none,all}', 'none'),
  ('set.edit', 'overwatch', '{none,all}', 'none'),
  ('debrief.manage', 'overwatch', '{none,all}', 'none'),
  ('debrief.contribute', 'overwatch', '{none,all}', 'none'),
  ('give.edit', 'overwatch', '{none,all}', 'none'),
  ('people.edit_others', 'overwatch', '{none,all}', 'none'),
  ('people.invite', 'overwatch', '{none,all}', 'none'),
  ('people.clear_records', 'overwatch', '{none,all}', 'none'),
  ('people.onboard', 'overwatch', '{none,all}', 'none'),
  ('people.ages', 'overwatch', '{none,all}', 'none'),
  ('people.remove', 'overwatch', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

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
  r_overwatch text;
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
    coalesce(max(x.reach) filter (where x.role_key = 'overwatch'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'head'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'assistant'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'member'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'coordinator'), 'none')
  into r_newcomer, r_admin, r_pastor, r_overwatch, r_head, r_assistant, r_member, r_coordinator
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

  -- Overwatch (0270): the same kind of standing. Never on the five things
  -- done as Overwatch — those cells are overwatch_may()'s to read, each
  -- only on a page Settings › Overwatch leaves open.
  if r_overwatch <> 'none'
     and cap not in ('msg.board_post', 'msg.chat', 'msg.polls', 'issue.as_overwatch', 'debrief.as_overwatch')
     and exists (
       select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'overwatch'
     ) then
    if r_overwatch = 'all' or mine then
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
  -- A grant past its end date (0218) is as if taken back.
  if exists (
    select 1 from public.permission_grants g
    where g.capability = cap
      and (g.expires_at is null or g.expires_at > now())
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

notify pgrst, 'reload schema';
