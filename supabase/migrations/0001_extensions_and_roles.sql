-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================================
-- Roles
-- ============================================================================
-- A user can hold multiple roles simultaneously (PRD Section 5), so roles are
-- modeled as rows, not a single column on the user. Scope of a role depends
-- on its type:
--   admin                     -> department_id NULL, service_id NULL (global)
--   department_head           -> department_id set, service_id NULL
--   assisting_head            -> department_id set, service_id NULL
--   service_flow_coordinator  -> service_id set, department_id NULL
-- "team_member" is not stored here: it is implied by a department_members row
-- (see 0003_departments.sql) and needs no separate role grant.
create type public.role_type as enum (
  'admin',
  'department_head',
  'assisting_head',
  'service_flow_coordinator'
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_type public.role_type not null,
  department_id uuid, -- fk added in 0003_departments.sql after departments exists
  service_id uuid,    -- fk added in 0004_services.sql after services exists
  created_at timestamptz not null default now(),
  constraint user_roles_scope_check check (
    (role_type = 'admin' and department_id is null and service_id is null)
    or (role_type in ('department_head', 'assisting_head') and department_id is not null and service_id is null)
    or (role_type = 'service_flow_coordinator' and service_id is not null and department_id is null)
  ),
  unique (user_id, role_type, department_id, service_id)
);

alter table public.user_roles enable row level security;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they can read user_roles regardless
-- of the caller's own RLS visibility into that table).
-- ---------------------------------------------------------------------------
create function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid and role_type = 'admin'
  );
$$;

create function public.has_dept_role(uid uuid, dept_id uuid, roles public.role_type[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid
      and department_id = dept_id
      and role_type = any(roles)
  );
$$;

create function public.is_dept_head(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_dept_role(uid, dept_id, array['department_head']::public.role_type[]);
$$;

create function public.is_dept_head_or_assisting(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_dept_role(uid, dept_id, array['department_head', 'assisting_head']::public.role_type[]);
$$;

create function public.is_service_coordinator(uid uuid, svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid and service_id = svc_id and role_type = 'service_flow_coordinator'
  );
$$;

-- Any role that isn't team-member (i.e. an elevated app role), used to gate
-- things like posting messages (FR14.1) or verifying checklists.
create function public.is_any_department_head(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid and role_type in ('department_head', 'assisting_head')
  );
$$;

create function public.is_any_coordinator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid and role_type = 'service_flow_coordinator'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: user_roles
-- ---------------------------------------------------------------------------
-- Everyone can see their own role grants; admins can see and manage all.
create policy user_roles_select_own on public.user_roles
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy user_roles_admin_write on public.user_roles
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
