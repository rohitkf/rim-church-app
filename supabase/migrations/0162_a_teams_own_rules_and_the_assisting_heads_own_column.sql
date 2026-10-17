/*
 * A team's own rules, and the Assisting Head's own column.
 *
 * Two asks. First, the grid in Settings › Access & privileges was the
 * church's: one answer for every team. A church wanted "on Worship the
 * members may change each other's availability; on Media only the Head
 * may" — so a team can now have rules of its own. `department_permissions`
 * holds only the cells a team set differently; `may()` reads the team's
 * cell for the team the row belongs to, and the church's where the team
 * set nothing. A team's rule can go no wider than the team (none, own,
 * team): "everywhere" is the church's to give.
 *
 * Second, the Assisting Head had always been the Head's twin: one column,
 * one answer. Now `assistant` is a profile of its own, given exactly what
 * the Head has out of the box — every catalog line below copies the
 * Head's, and the church's own changes to the Head's cells are copied
 * across — so nothing changes for anybody until somebody sets the two
 * apart. The fixed policies that read is_dept_head() still treat the two
 * as one; that is written on their rows.
 *
 * And the ask that started it: Heads see their team's availability
 * history out of the box (avail.history: team), as they could already
 * change its answers.
 */

-- ---------------------------------------------------------------------------
-- The Assisting Head, as a profile
-- ---------------------------------------------------------------------------

insert into public.permission_roles (key, label, position, builtin) values
  ('admin',       'Admin',          1, true),
  ('head',        'Team Head',      2, true),
  ('assistant',   'Assisting Head', 3, true),
  ('coordinator', 'Coordinator',    4, true),
  ('member',      'Team Member',    5, true),
  ('newcomer',    'Church Member',  6, true)
on conflict (key) do update set label = excluded.label, position = excluded.position, builtin = true;

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('app.permissions', 'assistant', '{none}', 'none'),
  ('rota.assign', 'assistant', '{none,team,all}', 'team'),
  ('rota.tag', 'assistant', '{none,team,all}', 'team'),
  ('rota.release_ask', 'assistant', '{none,team,all}', 'team'),
  ('rota.release_decide', 'assistant', '{none,team,all}', 'team'),
  ('rota.release_delete', 'assistant', '{none,team,all}', 'none'),
  ('svc.manage', 'assistant', '{none,all}', 'none'),
  ('svc.templates', 'assistant', '{none,all}', 'none'),
  ('svc.sessions', 'assistant', '{none,all}', 'none'),
  ('svc.guests', 'assistant', '{none,all}', 'none'),
  ('svc.repeat', 'assistant', '{none,all}', 'none'),
  ('svc.events', 'assistant', '{none,team,all}', 'team'),
  ('svc.call_times', 'assistant', '{none,team,all}', 'team'),
  ('team.create', 'assistant', '{none,all}', 'none'),
  ('team.edit', 'assistant', '{none,team,all}', 'team'),
  ('team.members', 'assistant', '{none,team,all}', 'team'),
  ('team.roles', 'assistant', '{none,team,all}', 'team'),
  ('team.groups', 'assistant', '{none,team,all}', 'team'),
  ('team.checklists', 'assistant', '{none,team,all}', 'team'),
  ('team.join', 'assistant', '{none,team,all}', 'team'),
  ('day.verify', 'assistant', '{none,team,all}', 'team'),
  ('day.ready', 'assistant', '{none,team,all}', 'team'),
  ('day.attendance', 'assistant', '{none,team,all}', 'team'),
  ('day.nudge', 'assistant', '{none,team,all}', 'team'),
  ('avail.edit_others', 'assistant', '{none,team,all}', 'team'),
  ('avail.add_others', 'assistant', '{none,team,all}', 'none'),
  ('avail.late_decide', 'assistant', '{none,team,all}', 'team'),
  ('avail.nudge', 'assistant', '{none,team,all}', 'team'),
  ('avail.history', 'assistant', '{none,own,team,all}', 'team'),
  ('inv.items', 'assistant', '{none,team,all}', 'team'),
  ('inv.stock', 'assistant', '{none,team,all}', 'team'),
  ('inv.purchase_ask', 'assistant', '{none,team,all}', 'team'),
  ('inv.purchase_decide', 'assistant', '{none,team,all}', 'team'),
  ('msg.board_post', 'assistant', '{none,team,all}', 'team'),
  ('msg.board_moderate', 'assistant', '{none,all}', 'none'),
  ('msg.chat', 'assistant', '{none,team,all}', 'team'),
  ('msg.chat_moderate', 'assistant', '{none,team,all}', 'none'),
  ('msg.polls', 'assistant', '{none,team,all}', 'team'),
  ('msg.updates', 'assistant', '{none,all}', 'none'),
  ('msg.alert_team', 'assistant', '{none,team,all}', 'team'),
  ('msg.alert', 'assistant', '{none,all}', 'none'),
  ('issue.mark', 'assistant', '{none,team,all}', 'team'),
  ('issue.delete', 'assistant', '{none,team,all}', 'none'),
  ('set.edit', 'assistant', '{none,team,all}', 'none'),
  ('debrief.manage', 'assistant', '{none,team,all}', 'team'),
  ('debrief.contribute', 'assistant', '{none,team,all}', 'none'),
  ('give.edit', 'assistant', '{none,all}', 'none'),
  ('people.edit_others', 'assistant', '{none}', 'none'),
  ('people.invite', 'assistant', '{none,team,all}', 'team'),
  ('people.clear_records', 'assistant', '{none,all}', 'none'),
  ('people.onboard', 'assistant', '{none,team,all}', 'none'),
  ('people.remove', 'assistant', '{none}', 'none'),
  ('avail.history', 'head', '{none,own,team,all}', 'team')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- What the church chose for its Heads, its Assisting Heads keep.
insert into public.role_permissions (role_key, capability, reach, updated_by, updated_at)
select 'assistant', capability, reach, updated_by, updated_at
from public.role_permissions where role_key = 'head'
on conflict (role_key, capability) do nothing;

-- A choice that now equals the default is forgotten, as set_permissions() would.
delete from public.role_permissions o
using public.permission_catalog c
where c.role_key = o.role_key and c.capability = o.capability and o.reach = c.default_reach;

-- ---------------------------------------------------------------------------
-- A team's own rules
-- ---------------------------------------------------------------------------

create table if not exists public.department_permissions (
  department_id uuid not null references public.departments(id) on delete cascade,
  role_key text not null,
  capability text not null,
  reach text not null check (reach in ('none', 'own', 'team')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (department_id, role_key, capability),
  foreign key (capability, role_key)
    references public.permission_catalog(capability, role_key) on delete cascade
);

comment on table public.department_permissions is
  'One team''s own rules (0162): the cells it set differently from the church. No wider than the team.';

alter table public.department_permissions enable row level security;

drop policy if exists department_permissions_select on public.department_permissions;
create policy department_permissions_select on public.department_permissions
  for select using ((select auth.uid()) is not null);

revoke all on public.department_permissions from anon;
revoke insert, update, delete, truncate on public.department_permissions from authenticated;
grant select on public.department_permissions to authenticated;

/*
 * The reach in force for one profile on one team: the team's own cell if
 * it set one the catalog still offers, otherwise the church's.
 */
create or replace function public.permission_reach(p_role text, p_cap text, p_dept uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select t.reach
    from public.department_permissions t
    join public.permission_catalog c on c.role_key = t.role_key and c.capability = t.capability
    where t.department_id = p_dept and t.role_key = p_role and t.capability = p_cap
      and t.reach = any(c.reaches)
  ), public.permission_reach(p_role, p_cap));
$$;

revoke all on function public.permission_reach(text, text, uuid) from public, anon;
grant execute on function public.permission_reach(text, text, uuid) to authenticated;

/** Heads this team, as its Head. */
create or replace function public.is_team_head(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_dept_role(uid, dept_id, array['department_head']::public.role_type[]);
$$;

/** Assists this team, as its Assisting Head. */
create or replace function public.is_team_assistant(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_dept_role(uid, dept_id, array['assisting_head']::public.role_type[]);
$$;

/** Heads any team. */
create or replace function public.is_a_head(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1 from public.user_roles r
    where r.user_id = uid and r.role_type = 'department_head' and r.department_id is not null
  );
$$;

/** Assists any team. */
create or replace function public.is_an_assistant(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and exists (
    select 1 from public.user_roles r
    where r.user_id = uid and r.role_type = 'assisting_head' and r.department_id is not null
  );
$$;

revoke all on function public.is_team_head(uuid, uuid), public.is_team_assistant(uuid, uuid),
  public.is_a_head(uuid), public.is_an_assistant(uuid) from public, anon;
grant execute on function public.is_team_head(uuid, uuid), public.is_team_assistant(uuid, uuid),
  public.is_a_head(uuid), public.is_an_assistant(uuid) to authenticated;

/*
 * The question, asked of the team's rules first. Mirrored by
 * lib/permissions.ts decide(); this is the one that holds.
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
  reach text;
  mine boolean := coalesce(who = uid, false);
begin
  if uid is null then
    return false;
  end if;

  if exists (select 1 from public.app_owner o where o.user_id = uid) then
    return true;
  end if;

  -- Everybody signed in is a Church Member, so this needs no lookup; and
  -- the church's rule is the only one — a Church Member has no team.
  reach := public.permission_reach('newcomer', cap);
  if reach = 'all' or (reach <> 'none' and mine) then
    return true;
  end if;

  -- An Admin's reach is the church's too: a team cannot narrow its Admins.
  reach := public.permission_reach('admin', cap);
  if reach <> 'none' and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'admin'
  ) then
    if reach = 'all' or mine then
      return true;
    end if;
  end if;

  reach := public.permission_reach('head', cap, dept);
  if reach <> 'none' and public.is_a_head(uid) then
    if reach = 'all' or mine or (reach = 'team' and dept is not null and public.is_team_head(uid, dept)) then
      return true;
    end if;
  end if;

  reach := public.permission_reach('assistant', cap, dept);
  if reach <> 'none' and public.is_an_assistant(uid) then
    if reach = 'all' or mine or (reach = 'team' and dept is not null and public.is_team_assistant(uid, dept)) then
      return true;
    end if;
  end if;

  reach := public.permission_reach('member', cap, dept);
  if reach <> 'none' then
    if reach = 'team' and dept is not null and public.is_dept_member(uid, dept) then
      return true;
    end if;
    if (reach = 'all' or mine)
       and exists (select 1 from public.department_members m where m.user_id = uid) then
      return true;
    end if;
  end if;

  reach := public.permission_reach('coordinator', cap, dept);
  if reach <> 'none' then
    if reach in ('team', 'all') and svc is not null and dept is not null and exists (
      select 1 from public.rota_assignments a
      where a.service_id = svc and a.department_id = dept and a.user_id = uid
        and lower(btrim(a.role_label)) in ('coordinator', 'team coordinator')
    ) then
      return true;
    end if;
    if (reach = 'all' or mine) and exists (
      select 1 from public.rota_assignments a
      where a.user_id = uid and lower(btrim(a.role_label)) in ('coordinator', 'team coordinator')
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

/*
 * Writing, now for a team too. A change with a "department" is that
 * team's own cell: only a profile whose "team" is a particular team
 * (head, assistant, coordinator, member), only a capability the catalog
 * offers that profile at "team", and no wider than the team; a null reach
 * gives the cell back to the church's rule. Without one it is the
 * church's cell, as before.
 */
create or replace function public.set_permissions(p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  change jsonb;
  v_role text;
  v_cap text;
  v_reach text;
  v_dept uuid;
  entry public.permission_catalog%rowtype;
begin
  if not public.may(auth.uid(), 'app.permissions') then
    raise exception 'Only the Owner or an Admin can change permissions.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Send the changes as a list.' using errcode = '22023';
  end if;

  for change in select value from jsonb_array_elements(p_changes) loop
    v_role := change ->> 'role';
    v_cap := change ->> 'capability';
    v_reach := change ->> 'reach';
    v_dept := nullif(change ->> 'department', '')::uuid;

    select * into entry from public.permission_catalog
    where role_key = v_role and capability = v_cap;
    if not found then
      raise exception 'There is no permission % for %.', v_cap, v_role using errcode = '22023';
    end if;

    if v_dept is not null then
      if not exists (select 1 from public.departments d where d.id = v_dept) then
        raise exception 'There is no such team.' using errcode = '22023';
      end if;
      if v_role not in ('head', 'assistant', 'coordinator', 'member') or not ('team' = any(entry.reaches)) then
        raise exception '% is not a team''s to set for %.', v_cap, v_role using errcode = '42501';
      end if;
      if v_reach is null then
        delete from public.department_permissions
        where department_id = v_dept and role_key = v_role and capability = v_cap;
      else
        if v_reach = 'all' or not (v_reach = any(entry.reaches)) then
          raise exception 'A team cannot give % % for %.', v_cap, v_reach, v_role using errcode = '22023';
        end if;
        insert into public.department_permissions (department_id, role_key, capability, reach, updated_by, updated_at)
        values (v_dept, v_role, v_cap, v_reach, auth.uid(), now())
        on conflict (department_id, role_key, capability) do update
          set reach = excluded.reach, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
      end if;
      continue;
    end if;

    if cardinality(entry.reaches) = 1 then
      raise exception '% is fixed for %.', v_cap, v_role using errcode = '42501';
    end if;
    if v_reach is null or not (v_reach = any(entry.reaches)) then
      raise exception '% cannot be given % for %.', v_cap, coalesce(v_reach, 'nothing'), v_role
        using errcode = '22023';
    end if;

    if v_reach = entry.default_reach then
      delete from public.role_permissions where role_key = v_role and capability = v_cap;
    else
      insert into public.role_permissions (role_key, capability, reach, updated_by, updated_at)
      values (v_role, v_cap, v_reach, auth.uid(), now())
      on conflict (role_key, capability) do update
        set reach = excluded.reach, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    end if;
  end loop;
end;
$$;

/* Back to the app's own: the church's changes and every team's. */
create or replace function public.restore_permission_defaults()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.may(auth.uid(), 'app.permissions') then
    raise exception 'Only the Owner or an Admin can change permissions.' using errcode = '42501';
  end if;
  delete from public.role_permissions where role_key is not null;
  delete from public.department_permissions where role_key is not null;
end;
$$;

notify pgrst, 'reload schema';
