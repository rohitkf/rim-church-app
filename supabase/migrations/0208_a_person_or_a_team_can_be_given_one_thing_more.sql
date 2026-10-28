/*
 * A person, or a team, can be given one thing more.
 *
 * The grid gives a capability to a profile — every Team Head, every Team
 * Member — and a team can narrow its own. What it could not say is "Asha
 * may also change the set list", or "everybody on Welcome may see the
 * clock-ins": a right for somebody by name, or for a team's people,
 * without handing it to everyone of their rank. Four rooms (Clock in,
 * Prayer, the planner's buttons, the stage) grew lists of their own for
 * exactly that. This is the one place for it.
 *
 * A grant names a capability, then either a person or a team — the team's
 * roster and its Head and Assisting Heads, as the rooms' lists mean it —
 * and how far it reaches: everywhere, or on the teams they are on (a
 * team's grant, on that team).
 *
 * - may() asks it last, after every rule the grid has, so a grant only
 *   ever adds. With no grants every answer is as it was: checked on
 *   production before applying, old may() against new, for every person,
 *   capability and team — and, with grants added at random and rolled
 *   back, against the rule written out separately.
 * - Only what the church could already give a profile other than Admin
 *   can be granted, at a reach some such profile may be offered: never
 *   the keys to the app (who is an Admin, the grid itself, the settings),
 *   which are fixed so that nobody can hand themselves everything else.
 * - Read by everybody signed in, as the grid is, so each phone can draw
 *   its buttons from the same answer; written only through
 *   set_permission_grants(), by whoever may change the grid.
 */

create table public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  capability text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  reach text not null check (reach in ('team', 'all')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  constraint permission_grants_one_grantee check ((user_id is null) <> (department_id is null))
);

-- One grant per capability and grantee; the capability leads, as may() asks.
create unique index permission_grants_person on public.permission_grants (capability, user_id) where user_id is not null;
create unique index permission_grants_team on public.permission_grants (capability, department_id) where department_id is not null;
-- For the cascades from a profile or a team.
create index permission_grants_user_id_idx on public.permission_grants (user_id);
create index permission_grants_department_id_idx on public.permission_grants (department_id);

alter table public.permission_grants enable row level security;
create policy permission_grants_select on public.permission_grants
  for select using ((select auth.uid()) is not null);

revoke all on public.permission_grants from anon;
revoke insert, update, delete, truncate on public.permission_grants from authenticated;
grant select on public.permission_grants to authenticated;

-- Screens hear that it changed, as they do for the grid (0202).
create trigger permission_grants_live after insert or update or delete on public.permission_grants
  for each statement execute function public.live_table_changed();

-- ---------------------------------------------------------------------------
-- What may be granted
-- ---------------------------------------------------------------------------

/*
 * A capability the church could give some profile other than Admin, at a
 * reach that profile may be offered: the catalog's own limits, so a grant
 * reaches no further than the grid could. A fixed cell is no choice.
 */
create or replace function public.permission_grant_is_valid(p_cap text, p_reach text)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_reach in ('team', 'all') and exists (
    select 1 from public.permission_catalog c
    where c.capability = p_cap
      and c.role_key in ('head', 'assistant', 'coordinator', 'member', 'newcomer')
      and cardinality(c.reaches) > 1
      and p_reach = any (c.reaches)
  );
$$;
revoke all on function public.permission_grant_is_valid(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- may(), with grants asked last
-- ---------------------------------------------------------------------------

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

  -- Given one thing more (0208): this person by name, or everybody on a
  -- team (its roster, its Head and Assisting Heads), may do this —
  -- everywhere, or on the teams they are on. Asked last, so a grant only
  -- ever adds to what the grid gives; with none, every answer is as it was.
  if exists (
    select 1 from public.permission_grants g
    where g.capability = cap
      and (
        g.user_id = uid
        or (g.department_id is not null and (
          exists (select 1 from public.department_members m where m.department_id = g.department_id and m.user_id = uid)
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


-- ---------------------------------------------------------------------------
-- Writing them
-- ---------------------------------------------------------------------------

/*
 * Each change: { capability, person | team, reach }. A reach of null takes
 * the grant away. Whoever may change the grid may change these.
 */
create or replace function public.set_permission_grants(p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  change jsonb;
  v_cap text;
  v_reach text;
  v_person uuid;
  v_team uuid;
begin
  if not public.may(auth.uid(), 'app.permissions') then
    raise exception 'Only the Owner or an Admin can give somebody one thing more.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Send the changes as a list.' using errcode = '22023';
  end if;

  for change in select value from jsonb_array_elements(p_changes) loop
    v_cap := change ->> 'capability';
    v_reach := change ->> 'reach';
    v_person := nullif(change ->> 'person', '')::uuid;
    v_team := nullif(change ->> 'team', '')::uuid;

    if (v_person is null) = (v_team is null) then
      raise exception 'A grant is for one person or one team.' using errcode = '22023';
    end if;
    if v_person is not null and not exists (select 1 from public.profiles p where p.id = v_person) then
      raise exception 'There is no such person.' using errcode = '22023';
    end if;
    if v_team is not null and not exists (select 1 from public.departments d where d.id = v_team) then
      raise exception 'There is no such team.' using errcode = '22023';
    end if;

    if v_reach is null then
      delete from public.permission_grants g
      where g.capability = v_cap
        and (g.user_id = v_person or g.department_id = v_team);
      continue;
    end if;

    if not public.permission_grant_is_valid(v_cap, v_reach) then
      raise exception '% cannot be given to somebody %.', v_cap,
        case v_reach when 'team' then 'on their teams' when 'all' then 'everywhere' else coalesce(v_reach, 'at all') end
        using errcode = '22023';
    end if;

    if v_person is not null then
      insert into public.permission_grants (capability, user_id, reach, granted_by)
      values (v_cap, v_person, v_reach, auth.uid())
      on conflict (capability, user_id) where user_id is not null do update
        set reach = excluded.reach, granted_by = excluded.granted_by, granted_at = now();
    else
      insert into public.permission_grants (capability, department_id, reach, granted_by)
      values (v_cap, v_team, v_reach, auth.uid())
      on conflict (capability, department_id) where department_id is not null do update
        set reach = excluded.reach, granted_by = excluded.granted_by, granted_at = now();
    end if;
  end loop;
end;
$$;
revoke all on function public.set_permission_grants(jsonb) from public, anon;
grant execute on function public.set_permission_grants(jsonb) to authenticated;

notify pgrst, 'reload schema';
