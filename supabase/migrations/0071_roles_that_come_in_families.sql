-- ============================================================================
-- Roles that come in families
-- ============================================================================
--
-- Worship has twenty-four roles: five worship leaders, seven backing
-- vocals, two keys, two drums, two basses, two guitars, and the handful
-- that are none of those. As one flat column it is a wall — finding
-- "Drums 2" means reading past nineteen names that are not it, and the
-- shape of the team, which is obvious to anybody standing in the room, is
-- invisible on the page.
--
-- So a team can name its own groups — Worship Leaders, Backing Vocals,
-- Band — and file each role under one.
--
-- One group per role, not several. A role in two groups draws twice, and
-- the second copy is a lie: there is one Drums 2 and it is filled once.
--
-- Deleting a group keeps its roles. They fall back to the ungrouped list,
-- which is a tidy-up; losing the roles would take their checklists and
-- every rota assignment ever made against them.

create table if not exists public.department_role_groups (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0 and length(name) <= 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (department_id, name)
);

create index if not exists department_role_groups_dept_idx
  on public.department_role_groups (department_id, sort_order);

alter table public.department_role_groups enable row level security;

-- Anybody signed in may read them: the groups are how the roles are
-- displayed, and the roles are already readable.
drop policy if exists department_role_groups_select on public.department_role_groups;
create policy department_role_groups_select on public.department_role_groups
  for select using (auth.uid() is not null);

-- Written by whoever may already shape the team's roles: an Admin, or the
-- team's own Head or Assisting Head. Same rule as department_roles, kept
-- deliberately identical rather than merely similar.
drop policy if exists department_role_groups_write on public.department_role_groups;
create policy department_role_groups_write on public.department_role_groups
  for all
  using (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
  );

-- The role's family. Null is a real answer — "not filed anywhere yet" —
-- and is what every role has the moment this runs.
alter table public.department_roles
  add column if not exists group_id uuid
    references public.department_role_groups(id) on delete set null;

create index if not exists department_roles_group_idx
  on public.department_roles (group_id);

-- ----------------------------------------------------------------------------
-- Coordinator becomes Team Coordinator
-- ----------------------------------------------------------------------------
--
-- The name alone is a one-line update. What makes this delicate is that
-- the *permission* is matched on the text: is_rota_coordinator() asks
-- whether a rota assignment's role_label reads 'coordinator', and
-- rota_assignments stores that label as free text copied at the moment
-- somebody was assigned. Renaming the role without touching those would
-- quietly strip the right to verify a team's checklist from everybody
-- already on a rota — the kind of break that shows up on a Sunday morning
-- rather than here.
--
-- So all three move together, and the function is taught both spellings
-- for good: a team that types "Coordinator" by hand next year means the
-- same job, and so does an old assignment nobody thought to migrate.

update public.department_roles
   set name = 'Team Coordinator'
 where lower(btrim(name)) = 'coordinator';

update public.rota_assignments
   set role_label = 'Team Coordinator'
 where lower(btrim(role_label)) = 'coordinator';

create or replace function public.is_rota_coordinator(uid uuid, assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rota_assignments target
    join public.rota_assignments mine
      on mine.service_id = target.service_id
     and mine.department_id = target.department_id
    where target.id = assignment_id
      and mine.user_id = uid
      and lower(btrim(mine.role_label)) in ('coordinator', 'team coordinator')
  );
$$;

-- New teams get the new name.
create or replace function public.ensure_coordinator_role(dept_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.department_roles (department_id, name)
  values (dept_id, 'Team Coordinator')
  on conflict (department_id, name) do nothing;
$$;

-- ----------------------------------------------------------------------------
-- Reordering the groups themselves
-- ----------------------------------------------------------------------------
-- Same shape as reorder_department_roles: every group of the team, once
-- each, so a stale page cannot half-apply an order it worked out before
-- somebody else added a group.
create or replace function public.reorder_role_groups(dept uuid, ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  i int;
begin
  if coalesce(array_length(ids, 1), 0) <> (
    select count(*) from public.department_role_groups where department_id = dept
  ) then
    raise exception 'a reorder needs every group of the team, once each';
  end if;
  if coalesce(array_length(ids, 1), 0) = 0 then
    return;
  end if;

  for i in 1..array_length(ids, 1) loop
    update public.department_role_groups
       set sort_order = i
     where id = ids[i] and department_id = dept;
    if not found then
      raise exception 'cannot reorder these groups';
    end if;
  end loop;
end;
$$;
