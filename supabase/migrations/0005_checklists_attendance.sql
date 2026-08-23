-- ============================================================================
-- Checklists & Attendance (Section 10)
-- ============================================================================
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (department_id, service_id)
);

alter table public.checklists enable row level security;

create type public.checklist_item_status as enum (
  'pending',
  'member_complete',
  'head_verified',
  'coordinator_verified'
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  role_label text not null,
  status public.checklist_item_status not null default 'pending',
  assigned_to uuid references public.profiles(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  verified_by_head uuid references public.profiles(id) on delete set null,
  verified_by_head_at timestamptz,
  verified_by_coordinator uuid references public.profiles(id) on delete set null,
  verified_by_coordinator_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.checklist_items enable row level security;

create trigger checklist_items_touch_updated_at
  before update on public.checklist_items
  for each row execute function public.touch_updated_at();

create function public.checklist_department(chk_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.checklists where id = chk_id;
$$;

create function public.checklist_service(chk_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select service_id from public.checklists where id = chk_id;
$$;

-- ---------------------------------------------------------------------------
-- Attendance (FR10.1) — expected vs. actual per department per service.
-- ---------------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  expected_count int not null default 0,
  actual_count int,
  logged_by uuid references public.profiles(id) on delete set null,
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, service_id)
);

alter table public.attendance enable row level security;

create trigger attendance_touch_updated_at
  before update on public.attendance
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Shared visibility rule: dashboard metrics (attendance %, checklist %) are
-- readable read-only cross-department by any Department Head or Assisting
-- Head (Open Question 3 decision), in addition to Admin, that department's
-- own members/heads, and the Service Flow Coordinator for that service.
-- ---------------------------------------------------------------------------
create function public.can_view_dept_service_metrics(uid uuid, dept_id uuid, svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(uid)
    or public.can_view_department_content(uid, dept_id)
    or public.is_service_coordinator(uid, svc_id)
    or public.is_any_department_head(uid);
$$;

-- ---------------------------------------------------------------------------
-- RLS: checklists
-- ---------------------------------------------------------------------------
create policy checklists_select on public.checklists
  for select using (public.can_view_dept_service_metrics(auth.uid(), department_id, service_id));

-- FR10.3: Department Heads create checklists for their own department.
create policy checklists_write on public.checklists
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

-- ---------------------------------------------------------------------------
-- RLS: checklist_items
-- Three-stage verification (FR10.2): member marks their own item complete,
-- the department Head or Assisting Head head-verifies (Assisting Heads are
-- view + checklist-verification only per Open Question 1 decision), and the
-- Service Flow Coordinator for that service gives final sign-off. Exact
-- stage-transition rules (e.g. can't coordinator-verify before head-verify)
-- are enforced in the application/FastAPI layer; RLS here governs *who* may
-- touch a row at all, not the state machine.
-- ---------------------------------------------------------------------------
create policy checklist_items_select on public.checklist_items
  for select using (
    public.can_view_dept_service_metrics(
      auth.uid(),
      public.checklist_department(checklist_id),
      public.checklist_service(checklist_id)
    )
  );

create policy checklist_items_insert on public.checklist_items
  for insert with check (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), public.checklist_department(checklist_id))
  );

create policy checklist_items_update on public.checklist_items
  for update using (
    public.is_admin(auth.uid())
    or assigned_to = auth.uid()
    or public.is_dept_head_or_assisting(auth.uid(), public.checklist_department(checklist_id))
    or public.is_service_coordinator(auth.uid(), public.checklist_service(checklist_id))
  )
  with check (
    public.is_admin(auth.uid())
    or assigned_to = auth.uid()
    or public.is_dept_head_or_assisting(auth.uid(), public.checklist_department(checklist_id))
    or public.is_service_coordinator(auth.uid(), public.checklist_service(checklist_id))
  );

create policy checklist_items_delete on public.checklist_items
  for delete using (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), public.checklist_department(checklist_id))
  );

-- ---------------------------------------------------------------------------
-- RLS: attendance
-- ---------------------------------------------------------------------------
create policy attendance_select on public.attendance
  for select using (public.can_view_dept_service_metrics(auth.uid(), department_id, service_id));

-- FR10.1: Department Head logs attendance. Assisting Heads are view-only.
create policy attendance_write on public.attendance
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );
