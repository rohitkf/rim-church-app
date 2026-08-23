-- ============================================================================
-- Services & Service Planner (Section 11)
-- ============================================================================
create table public.services (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  service_type text not null,
  created_at timestamptz not null default now(),
  unique (date, service_type)
);

alter table public.services enable row level security;

-- Now that services exists, wire up the deferred FK from user_roles.
alter table public.user_roles
  add constraint user_roles_service_id_fkey
  foreign key (service_id) references public.services(id) on delete cascade;

-- Call time (arrival time) per department, per service (FR12.5).
create table public.department_call_times (
  department_id uuid not null references public.departments(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  call_time timestamptz not null,
  primary key (department_id, service_id)
);

alter table public.department_call_times enable row level security;

-- ---------------------------------------------------------------------------
-- Ordered list of running-order sessions for a service (FR11.1).
-- Only the first session's start_time is directly editable (FR11.2); every
-- later session's start_time is computed as previous.start_time +
-- previous.duration_minutes (FR11.3), recalculated by a trigger whenever an
-- earlier session's start_time or duration changes (FR11.4).
-- ---------------------------------------------------------------------------
create table public.service_sessions (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  order_index int not null,
  start_time timestamptz not null,
  duration_minutes int not null default 0,
  session_name text not null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  -- Optional link to a department + role label for Worship-style
  -- role-to-person mapping syncing with the planner (FR12.8).
  department_id uuid references public.departments(id) on delete set null,
  role_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, order_index)
);

alter table public.service_sessions enable row level security;

create trigger service_sessions_touch_updated_at
  before update on public.service_sessions
  for each row execute function public.touch_updated_at();

create function public.recalculate_session_chain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_start timestamptz;
  prev_duration int;
  r record;
begin
  select start_time, duration_minutes into prev_start, prev_duration
  from public.service_sessions
  where service_id = new.service_id and order_index = new.order_index;

  for r in
    select id, duration_minutes
    from public.service_sessions
    where service_id = new.service_id and order_index > new.order_index
    order by order_index asc
  loop
    prev_start := prev_start + make_interval(mins => prev_duration);
    update public.service_sessions
      set start_time = prev_start
      where id = r.id;
    prev_duration := r.duration_minutes;
  end loop;

  return null;
end;
$$;

create trigger service_sessions_recalculate_chain
  after insert or update of start_time, duration_minutes on public.service_sessions
  for each row execute function public.recalculate_session_chain();

-- ---------------------------------------------------------------------------
-- RLS: services / department_call_times / service_sessions
-- ---------------------------------------------------------------------------
-- Service dates/running order are not privacy-sensitive; every signed-in
-- user can view them (the dashboard and service planner are read-visible
-- app-wide, per-department restrictions apply to department-owned data
-- like roster/handbook/inventory instead).
create policy services_select on public.services
  for select using (auth.uid() is not null);

create policy services_write on public.services
  for all using (
    public.is_admin(auth.uid()) or public.is_service_coordinator(auth.uid(), id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_service_coordinator(auth.uid(), id)
  );

create policy department_call_times_select on public.department_call_times
  for select using (auth.uid() is not null);

create policy department_call_times_write on public.department_call_times
  for all using (
    public.is_admin(auth.uid())
    or public.is_service_coordinator(auth.uid(), service_id)
    or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_service_coordinator(auth.uid(), service_id)
    or public.is_dept_head(auth.uid(), department_id)
  );

create policy service_sessions_select on public.service_sessions
  for select using (auth.uid() is not null);

-- The coordinator for the service owns the running order; a department head
-- may edit sessions synced to their own department's role assignments
-- (FR12.8), e.g. re-assigning who's singing without touching timing owned
-- by the coordinator.
create policy service_sessions_write on public.service_sessions
  for all using (
    public.is_admin(auth.uid())
    or public.is_service_coordinator(auth.uid(), service_id)
    or (department_id is not null and public.is_dept_head(auth.uid(), department_id))
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_service_coordinator(auth.uid(), service_id)
    or (department_id is not null and public.is_dept_head(auth.uid(), department_id))
  );
