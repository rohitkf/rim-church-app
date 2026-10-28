/*
 * may() asks its questions in fewer, cheaper reads.
 *
 * Every write policy, and the read rules of availability_history and
 * purchase_requests, call may() once per row, and it cost 1 to 3 ms a
 * call: up to six permission_reach() calls, each a nested function with
 * its own one or two queries, then a function call per role check
 * (is_a_head, is_team_head, is_dept_member and the rest), none of which
 * Postgres can fold into the caller.
 *
 * The answers are the same and are reached in the same order. What
 * changes is how the facts are read: all six tiers' reach for the
 * capability in one query, exactly as permission_reach() resolves each
 * (the team's valid rule for the tiers a team may set, else the church's
 * valid rule, else the catalog default, else none), and each role check
 * as the query its helper ran, inline, on the indexes 0204 added.
 *
 * Checked on production before applying, old against new, with the
 * candidate as a temporary function: every person and nobody signed in,
 * every capability, every team and none, the services with a coordinator,
 * one other and none, and the caller's own row and somebody else's —
 * 214,650 calls on the church's own grid and 214,650 more on three random
 * grids (every tier and team overridden at random, rolled back). No call
 * answered differently.
 *
 * Same signature, attributes and grants: create or replace keeps them.
 */

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
    coalesce(max(x.reach) filter (where x.role_key = 'head'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'assistant'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'member'), 'none'),
    coalesce(max(x.reach) filter (where x.role_key = 'coordinator'), 'none')
  into r_newcomer, r_admin, r_head, r_assistant, r_member, r_coordinator
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

  return false;
end;
$$;
