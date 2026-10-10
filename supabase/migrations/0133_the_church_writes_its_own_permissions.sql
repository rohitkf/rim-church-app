/*
 * The church writes its own permissions — the foundation, and the Team rota.
 *
 * Until now every permission was a policy, and the Access page described
 * them. From here a permission can also be a row: Settings › Access &
 * privileges shows a grid, an Admin changes a cell, and the database's own
 * rules read that cell on the next request. Still enforced by Postgres,
 * still impossible to talk out of with a browser — the policies simply ask
 * `may()` instead of naming a role.
 *
 * Three tables and three functions:
 *
 *   permission_roles     the profiles a permission is given to. The five
 *                        built-in ones now; a church's own later.
 *   permission_catalog   what each profile *can* be given for each
 *                        capability (`reaches`, narrowest first) and what
 *                        it has out of the box (`default_reach`). One reach
 *                        on offer means the cell is fixed. Written only by
 *                        migrations.
 *   role_permissions     the church's choices: only the cells it changed.
 *                        Restoring the defaults is emptying it.
 *
 *   permission_reach(role, cap)              the reach in force.
 *   may(uid, cap, dept, svc, who)            the one question every
 *                                            converted policy asks.
 *   set_permissions(changes), restore_permission_defaults()
 *                                            the only way to write.
 *
 * Reaches: none · own (rows that are theirs: `who`) · team (the team the
 * row belongs to: `dept`) · all. Each includes the one before it.
 *
 * A person may do something if any profile they hold allows it:
 *   Owner         always. Not in the catalog: it is how a wrong grid gets
 *                 put right.
 *   Admin         holds a user_roles 'admin' row. none or all.
 *   Team Head     Head or Assisting Head of a team. `team` is their own.
 *   Coordinator   in Team Coordinator on the rota. `team` is that team, at
 *                 that service (`svc`) — not a standing rank.
 *   Team Member   on a team's roster. `team` is a team they are on.
 *   Church Member everybody signed in, so whatever it is given, everybody
 *                 is given.
 *
 * Converted in this release: the Team rota. Its defaults below are exactly
 * what the policies said before (0045, 0091 and since), so applying this
 * changes nothing for anybody until somebody changes a cell. Every other
 * area keeps its policies as they are and shows as "coming soon".
 *
 * Fixed for everybody, in no catalog: handing over ownership, editing your
 * own profile, answering your own availability, withdrawing your own
 * release request. And a finished service stays a record whatever the grid
 * says — `service_has_finished` still guards every rota write.
 */

-- ---------------------------------------------------------------------------
-- The profiles
-- ---------------------------------------------------------------------------

create table if not exists public.permission_roles (
  key text primary key check (key ~ '^[a-z][a-z_]*$'),
  label text not null,
  position smallint not null,
  builtin boolean not null default false
);

insert into public.permission_roles (key, label, position, builtin) values
  ('admin',       'Admin',          1, true),
  ('head',        'Team Head',      2, true),
  ('coordinator', 'Coordinator',    3, true),
  ('member',      'Team Member',    4, true),
  ('newcomer',    'Church Member',  5, true)
on conflict (key) do update set label = excluded.label, position = excluded.position, builtin = true;

-- ---------------------------------------------------------------------------
-- What can be given
-- ---------------------------------------------------------------------------

create table if not exists public.permission_catalog (
  capability text not null check (capability ~ '^[a-z]+\.[a-z_]+$'),
  role_key text not null references public.permission_roles(key) on delete cascade,
  reaches text[] not null,
  default_reach text not null,
  primary key (capability, role_key),
  constraint permission_catalog_reaches_known
    check (cardinality(reaches) > 0 and reaches <@ array['none', 'own', 'team', 'all']),
  constraint permission_catalog_default_offered check (default_reach = any(reaches))
);

/*
 * One line per capability and profile, in this exact shape: the app keeps
 * the same table (lib/permissions.ts) so the grid draws at once, and
 * lib/permissionCatalog.test.ts reads these lines to hold the two together.
 */
insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('app.permissions', 'admin', '{all}', 'all'),
  ('app.permissions', 'head', '{none}', 'none'),
  ('app.permissions', 'coordinator', '{none}', 'none'),
  ('app.permissions', 'member', '{none}', 'none'),
  ('app.permissions', 'newcomer', '{none}', 'none'),
  ('rota.assign', 'admin', '{none,all}', 'all'),
  ('rota.assign', 'head', '{none,team,all}', 'team'),
  ('rota.assign', 'coordinator', '{none,team}', 'none'),
  ('rota.assign', 'member', '{none,team,all}', 'none'),
  ('rota.assign', 'newcomer', '{none}', 'none'),
  ('rota.tag', 'admin', '{none,all}', 'all'),
  ('rota.tag', 'head', '{none,team,all}', 'team'),
  ('rota.tag', 'coordinator', '{none,team}', 'none'),
  ('rota.tag', 'member', '{none,team,all}', 'none'),
  ('rota.tag', 'newcomer', '{none}', 'none'),
  ('rota.release_ask', 'admin', '{none,all}', 'all'),
  ('rota.release_ask', 'head', '{none,team,all}', 'team'),
  ('rota.release_ask', 'coordinator', '{none,team}', 'none'),
  ('rota.release_ask', 'member', '{none,team}', 'none'),
  ('rota.release_ask', 'newcomer', '{none}', 'none'),
  ('rota.release_decide', 'admin', '{none,all}', 'all'),
  ('rota.release_decide', 'head', '{none,team,all}', 'team'),
  ('rota.release_decide', 'coordinator', '{none,team}', 'none'),
  ('rota.release_decide', 'member', '{none,team}', 'none'),
  ('rota.release_decide', 'newcomer', '{none}', 'none'),
  ('rota.release_delete', 'admin', '{none,all}', 'all'),
  ('rota.release_delete', 'head', '{none,team,all}', 'none'),
  ('rota.release_delete', 'coordinator', '{none}', 'none'),
  ('rota.release_delete', 'member', '{none}', 'none'),
  ('rota.release_delete', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ---------------------------------------------------------------------------
-- What the church chose
-- ---------------------------------------------------------------------------

create table if not exists public.role_permissions (
  role_key text not null,
  capability text not null,
  reach text not null check (reach in ('none', 'own', 'team', 'all')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (role_key, capability),
  foreign key (capability, role_key)
    references public.permission_catalog(capability, role_key) on delete cascade
);

alter table public.permission_roles enable row level security;
alter table public.permission_catalog enable row level security;
alter table public.role_permissions enable row level security;

-- Who may do what is not a secret: everybody's app reads it to decide
-- which buttons to draw. Nobody writes it but set_permissions().
create policy permission_roles_select on public.permission_roles
  for select using ((select auth.uid()) is not null);
create policy permission_catalog_select on public.permission_catalog
  for select using ((select auth.uid()) is not null);
create policy role_permissions_select on public.role_permissions
  for select using ((select auth.uid()) is not null);

revoke all on public.permission_roles, public.permission_catalog, public.role_permissions from anon;
revoke insert, update, delete, truncate on public.permission_roles, public.permission_catalog, public.role_permissions
  from authenticated;
grant select on public.permission_roles, public.permission_catalog, public.role_permissions to authenticated;

-- ---------------------------------------------------------------------------
-- The question
-- ---------------------------------------------------------------------------

/*
 * The reach in force for one profile: the church's choice if it made one
 * that is still on offer, otherwise the default, otherwise nothing. A
 * capability nobody catalogued is nobody's but the Owner's — a typo in a
 * policy fails closed.
 */
create or replace function public.permission_reach(p_role text, p_cap text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select coalesce(case when o.reach = any(c.reaches) then o.reach end, c.default_reach)
    from public.permission_catalog c
    left join public.role_permissions o
      on o.role_key = c.role_key and o.capability = c.capability
    where c.role_key = p_role and c.capability = p_cap
  ), 'none');
$$;

/*
 * May this person do this, to a row of this team, at this service, that
 * belongs to this person?
 *
 * Mirrored by lib/permissions.ts `can()`, which only decides whether a
 * button is worth drawing. This is the one that holds.
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

  -- Everybody signed in is a Church Member, so this needs no lookup.
  reach := public.permission_reach('newcomer', cap);
  if reach = 'all' or (reach <> 'none' and mine) then
    return true;
  end if;

  reach := public.permission_reach('admin', cap);
  if reach <> 'none' and exists (
    select 1 from public.user_roles r where r.user_id = uid and r.role_type = 'admin'
  ) then
    if reach = 'all' or mine then
      return true;
    end if;
  end if;

  reach := public.permission_reach('head', cap);
  if reach <> 'none' and public.is_a_lead(uid) then
    if reach = 'all' or mine or (reach = 'team' and dept is not null and public.is_dept_head(uid, dept)) then
      return true;
    end if;
  end if;

  reach := public.permission_reach('member', cap);
  if reach <> 'none' then
    if reach = 'team' and dept is not null and public.is_dept_member(uid, dept) then
      return true;
    end if;
    if (reach = 'all' or mine)
       and exists (select 1 from public.department_members m where m.user_id = uid) then
      return true;
    end if;
  end if;

  reach := public.permission_reach('coordinator', cap);
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

revoke all on function public.permission_reach(text, text) from public, anon;
grant execute on function public.permission_reach(text, text) to authenticated;
revoke all on function public.may(uuid, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.may(uuid, text, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------

/*
 * A batch of cells: [{"role": "head", "capability": "rota.assign",
 * "reach": "all"}, ...]. All or nothing. A cell set back to its default is
 * forgotten rather than stored, so a later change to that default reaches
 * this church too.
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

    select * into entry from public.permission_catalog
    where role_key = v_role and capability = v_cap;
    if not found then
      raise exception 'There is no permission % for %.', v_cap, v_role using errcode = '22023';
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
end;
$$;

revoke all on function public.set_permissions(jsonb) from public, anon;
grant execute on function public.set_permissions(jsonb) to authenticated;
revoke all on function public.restore_permission_defaults() from public, anon;
grant execute on function public.restore_permission_defaults() to authenticated;

-- ---------------------------------------------------------------------------
-- The Team rota reads the grid
-- ---------------------------------------------------------------------------

alter policy rota_assignments_write on public.rota_assignments
  using (
    not public.service_has_finished(service_id)
    and public.may(auth.uid(), 'rota.assign', department_id, service_id)
  )
  with check (
    not public.service_has_finished(service_id)
    and public.may(auth.uid(), 'rota.assign', department_id, service_id)
  );

alter policy rota_assignment_tags_write on public.rota_assignment_tags
  using (exists (
    select 1 from public.rota_assignments a
    where a.id = rota_assignment_tags.assignment_id
      and not public.service_has_finished(a.service_id)
      and public.may(auth.uid(), 'rota.tag', a.department_id, a.service_id)
  ))
  with check (exists (
    select 1 from public.rota_assignments a
    where a.id = rota_assignment_tags.assignment_id
      and not public.service_has_finished(a.service_id)
      and public.may(auth.uid(), 'rota.tag', a.department_id, a.service_id)
  ));

-- Asking is done for the team that wants the person.
alter policy rota_release_requests_insert on public.rota_release_requests
  with check (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and requested_by = auth.uid()
    and public.may(auth.uid(), 'rota.release_ask', requesting_department_id,
                   public.rota_assignment_service(assignment_id))
  );

-- Answering is done for the team that has them.
alter policy rota_release_requests_decide on public.rota_release_requests
  using (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and public.may(auth.uid(), 'rota.release_decide', public.rota_assignment_department(assignment_id),
                   public.rota_assignment_service(assignment_id))
  )
  with check (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and public.may(auth.uid(), 'rota.release_decide', public.rota_assignment_department(assignment_id),
                   public.rota_assignment_service(assignment_id))
  );

-- Withdrawing your own stays yours; deleting anybody's is the grid's.
alter policy rota_release_requests_delete on public.rota_release_requests
  using (
    requested_by = auth.uid()
    or public.may(auth.uid(), 'rota.release_delete', requesting_department_id,
                  public.rota_assignment_service(assignment_id))
    or public.may(auth.uid(), 'rota.release_delete', public.rota_assignment_department(assignment_id),
                  public.rota_assignment_service(assignment_id))
  );

-- Whoever may ask, answer or delete a request can read it.
alter policy rota_release_requests_select on public.rota_release_requests
  using (
    requested_by = auth.uid()
    or public.may(auth.uid(), 'rota.release_ask', requesting_department_id,
                  public.rota_assignment_service(assignment_id))
    or public.may(auth.uid(), 'rota.release_decide', public.rota_assignment_department(assignment_id),
                  public.rota_assignment_service(assignment_id))
    or public.may(auth.uid(), 'rota.release_delete', requesting_department_id,
                  public.rota_assignment_service(assignment_id))
    or public.may(auth.uid(), 'rota.release_delete', public.rota_assignment_department(assignment_id),
                  public.rota_assignment_service(assignment_id))
  );

/*
 * Approving a release frees the person, which means deleting the
 * assignment that holds them. The app used to do that as a second request
 * — which needed the right to change the holding team's rota as well as
 * the right to answer. Now answering is one step, and the right to answer
 * is all it needs.
 */
create or replace function public.answer_release_request(p_request uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.rota_release_requests%rowtype;
  holding uuid;
  svc uuid;
begin
  select * into req from public.rota_release_requests where id = p_request for update;
  if not found then
    raise exception 'That request is no longer there.' using errcode = 'P0002';
  end if;

  select a.department_id, a.service_id into holding, svc
  from public.rota_assignments a where a.id = req.assignment_id;

  if public.service_has_finished(svc) then
    raise exception 'That service is over, so its rota is a record now.' using errcode = '42501';
  end if;
  if not public.may(auth.uid(), 'rota.release_decide', holding, svc) then
    raise exception 'Only somebody who answers for that team can decide this.' using errcode = '42501';
  end if;
  if req.status <> 'pending' then
    raise exception 'That request has already been answered.' using errcode = '22023';
  end if;

  update public.rota_release_requests
  set status = case when p_approve then 'approved' else 'denied' end::public.rota_request_status,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_request;

  if p_approve then
    delete from public.rota_assignments where id = req.assignment_id;
  end if;
end;
$$;

revoke all on function public.answer_release_request(uuid, boolean) from public, anon;
grant execute on function public.answer_release_request(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
