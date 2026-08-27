-- ============================================================================
-- Team Rota + release requests
-- ============================================================================
-- Who is doing what job, per team, for a given service. A person can hold
-- only one role across the whole service — being cameraman for Media and
-- usher for Volunteers at the same service is the conflict this feature
-- exists to catch — so the unique constraint is on (service_id, user_id),
-- not per department. Freeing someone up is therefore a negotiation
-- between two teams, which is what rota_release_requests carries.
create table public.rota_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, user_id)
);

alter table public.rota_assignments enable row level security;

create trigger rota_assignments_touch_updated_at
  before update on public.rota_assignments
  for each row execute function public.touch_updated_at();

create index rota_assignments_service_department_idx
  on public.rota_assignments (service_id, department_id);

-- Which department currently holds an assignment — needed by the request
-- policies below, and SECURITY DEFINER so a requesting head can be checked
-- against a row they cannot themselves read.
create function public.rota_assignment_department(assignment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.rota_assignments where id = assignment_id;
$$;

-- ---------------------------------------------------------------------------
-- RLS: rota_assignments
-- ---------------------------------------------------------------------------
-- Everyone signed in can read the rota: people need to see their own role,
-- and a head needs to see who is already taken elsewhere before asking for
-- them. Only the owning department's head (or Admin) writes it.
create policy rota_assignments_select on public.rota_assignments
  for select using (auth.uid() is not null);

create policy rota_assignments_write on public.rota_assignments
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

-- ---------------------------------------------------------------------------
-- Release requests
-- ---------------------------------------------------------------------------
create type public.rota_request_status as enum ('pending', 'approved', 'denied');

create table public.rota_release_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.rota_assignments(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  requesting_department_id uuid not null references public.departments(id) on delete cascade,
  requested_role_label text not null,
  status public.rota_request_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.rota_release_requests enable row level security;

-- One open ask per assignment, so a person can't be chased twice at once.
create unique index rota_release_requests_one_pending
  on public.rota_release_requests (assignment_id)
  where status = 'pending';

-- Visible to the head who asked, the head being asked, and Admin.
create policy rota_release_requests_select on public.rota_release_requests
  for select using (
    requested_by = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), requesting_department_id)
    or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
  );

-- Raised by the head who wants the person, on their own behalf.
create policy rota_release_requests_insert on public.rota_release_requests
  for insert with check (
    requested_by = auth.uid()
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), requesting_department_id)
    )
  );

-- Answered only by the head who currently holds the person (or Admin).
create policy rota_release_requests_decide on public.rota_release_requests
  for update using (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
  );

create policy rota_release_requests_delete on public.rota_release_requests
  for delete using (requested_by = auth.uid() or public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Notify the head being asked
-- ---------------------------------------------------------------------------
-- Runs as owner so it can write notification rows for someone else, the
-- same way the message board fan-out does.
create function public.notify_on_rota_release_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  holding_department uuid;
begin
  select department_id into holding_department
  from public.rota_assignments where id = new.assignment_id;

  insert into public.notifications (user_id, type, reference_id)
  select r.user_id, 'rota_release_request', new.id
  from public.user_roles r
  where r.department_id = holding_department
    and r.role_type = 'department_head'
    and r.user_id <> new.requested_by;

  return new;
end;
$$;

create trigger rota_release_requests_notify
  after insert on public.rota_release_requests
  for each row execute function public.notify_on_rota_release_request();

-- Tell the asking head the answer.
create function public.notify_on_rota_release_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    insert into public.notifications (user_id, type, reference_id)
    values (new.requested_by, 'rota_release_' || new.status::text, new.id);
  end if;
  return new;
end;
$$;

create trigger rota_release_requests_notify_decision
  after update on public.rota_release_requests
  for each row execute function public.notify_on_rota_release_decision();
