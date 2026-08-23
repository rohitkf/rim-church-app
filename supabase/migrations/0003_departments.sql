-- ============================================================================
-- Departments
-- ============================================================================
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  handbook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.departments enable row level security;

create trigger departments_touch_updated_at
  before update on public.departments
  for each row execute function public.touch_updated_at();

-- Now that departments exists, wire up the deferred FK from user_roles.
alter table public.user_roles
  add constraint user_roles_department_id_fkey
  foreign key (department_id) references public.departments(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Department membership (FR12.2 / FR12.3)
-- core   -> registered user who is a core team member of the department
-- guest  -> granted cross-department visibility without core membership
-- ---------------------------------------------------------------------------
create type public.member_type as enum ('core', 'guest');

create table public.department_members (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_type public.member_type not null default 'core',
  created_at timestamptz not null default now(),
  unique (department_id, user_id)
);

alter table public.department_members enable row level security;

create function public.is_dept_member(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.department_members
    where department_id = dept_id and user_id = uid
  );
$$;

create function public.can_view_department_content(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(uid)
    or public.is_dept_member(uid, dept_id)
    or public.is_dept_head_or_assisting(uid, dept_id);
$$;

-- ---------------------------------------------------------------------------
-- RLS: departments
-- ---------------------------------------------------------------------------
-- Basic department listing (name/handbook) is scoped to core/guest members,
-- that department's head/assisting head, Admin, and Service Flow
-- Coordinators (who need to see all departments to plan/assign across a
-- service, per Section 5's cross-department coordinator remit). This is
-- distinct from dashboard *metrics* cross-visibility for heads, which is
-- handled on the attendance/checklist tables below.
create policy departments_select on public.departments
  for select using (
    public.can_view_department_content(auth.uid(), id)
    or public.is_any_coordinator(auth.uid())
  );

create policy departments_admin_write on public.departments
  for insert with check (public.is_admin(auth.uid()));

-- Assisting Heads are view-only + checklist verification (PRD Open Question 1
-- decision) so only the Head (not Assisting Head) can edit department
-- settings/handbook (FR12.7) or membership.
create policy departments_head_update on public.departments
  for update using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), id)
  );

create policy departments_admin_delete on public.departments
  for delete using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS: department_members
-- ---------------------------------------------------------------------------
create policy department_members_select on public.department_members
  for select using (public.can_view_department_content(auth.uid(), department_id));

create policy department_members_write on public.department_members
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );
