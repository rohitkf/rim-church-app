-- ============================================================================
-- Role checklists: standing per-role lists, worked per service
-- ============================================================================
-- A team defines its checklist once per role ("Cameraman: 5 things"), and
-- whoever holds that role in the Team Rota for a service works that list
-- for that service. Verification stays three-stage: the person ticks it,
-- their team head verifies, and Service Flow signs it off.

-- Which team is Service Flow. Its rota members do the final sign-off, so
-- the app needs to know which department that is rather than matching on
-- a name someone might rename.
alter table public.departments add column is_service_flow boolean not null default false;

create unique index departments_one_service_flow
  on public.departments ((true)) where is_service_flow;

-- The standing list, per role.
create table public.department_role_checklist_items (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.department_roles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.department_role_checklist_items enable row level security;

create index department_role_checklist_items_role_idx
  on public.department_role_checklist_items (role_id);

create policy department_role_checklist_items_select on public.department_role_checklist_items
  for select using (auth.uid() is not null);

create policy department_role_checklist_items_write on public.department_role_checklist_items
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

-- Tie a rota assignment to the role record, so its checklist can be found
-- without matching on the label text.
alter table public.rota_assignments
  add column role_id uuid references public.department_roles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Who signs off
-- ---------------------------------------------------------------------------
create function public.rota_assignment_service(assignment_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select service_id from public.rota_assignments where id = assignment_id;
$$;

create function public.rota_assignment_user(assignment_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.rota_assignments where id = assignment_id;
$$;

-- The Service Flow coordinator "assigned for that service" is whoever the
-- rota puts in the Service Flow team for it; that team's head can also
-- sign off, since a head deputises for their team.
create function public.is_service_flow_signer(uid uuid, svc_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.rota_assignments ra
    join public.departments d on d.id = ra.department_id
    where ra.service_id = svc_id and d.is_service_flow and ra.user_id = uid
  ) or exists (
    select 1 from public.departments d
    where d.is_service_flow and public.is_dept_head(uid, d.id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Progress, per assignment per item
-- ---------------------------------------------------------------------------
create table public.rota_checklist_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.rota_assignments(id) on delete cascade,
  item_id uuid not null references public.department_role_checklist_items(id) on delete cascade,
  status public.checklist_item_status not null default 'pending',
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  verified_by_head uuid references public.profiles(id) on delete set null,
  verified_by_head_at timestamptz,
  verified_by_coordinator uuid references public.profiles(id) on delete set null,
  verified_by_coordinator_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (assignment_id, item_id)
);

alter table public.rota_checklist_progress enable row level security;

create trigger rota_checklist_progress_touch_updated_at
  before update on public.rota_checklist_progress
  for each row execute function public.touch_updated_at();

create policy rota_checklist_progress_select on public.rota_checklist_progress
  for select using (
    auth.uid() = public.rota_assignment_user(assignment_id)
    or public.can_view_department_content(auth.uid(), public.rota_assignment_department(assignment_id))
    or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
  );

create policy rota_checklist_progress_write on public.rota_checklist_progress
  for all using (
    public.is_admin(auth.uid())
    or auth.uid() = public.rota_assignment_user(assignment_id)
    or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
    or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
  )
  with check (
    public.is_admin(auth.uid())
    or auth.uid() = public.rota_assignment_user(assignment_id)
    or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
    or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
  );

-- RLS says who may touch a row; the chain itself — who may move it to
-- which stage, and only from the stage before — is enforced here, so a
-- crafted request can't skip a signature.
create function public.rota_checklist_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dept uuid;
  svc uuid;
  assignee uuid;
  previous public.checklist_item_status;
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;

  dept := public.rota_assignment_department(new.assignment_id);
  svc := public.rota_assignment_service(new.assignment_id);
  assignee := public.rota_assignment_user(new.assignment_id);
  previous := coalesce(old.status, 'pending');

  if new.status = previous then
    return new;
  end if;

  if new.status = 'member_complete' then
    if auth.uid() is distinct from assignee then
      raise exception 'Only the person holding this role can mark it complete';
    end if;
    if previous <> 'pending' then
      raise exception 'This item has already moved past being marked complete';
    end if;

  elsif new.status = 'head_verified' then
    if not public.is_dept_head(auth.uid(), dept) then
      raise exception 'Only the team head can verify this item';
    end if;
    if previous <> 'member_complete' then
      raise exception 'Verify only after the volunteer has marked it complete';
    end if;

  elsif new.status = 'coordinator_verified' then
    if not public.is_service_flow_signer(auth.uid(), svc) then
      raise exception 'Only Service Flow can give final sign-off';
    end if;
    if previous <> 'head_verified' then
      raise exception 'Sign off only after the team head has verified';
    end if;

  elsif new.status = 'pending' then
    if not public.is_dept_head(auth.uid(), dept) then
      raise exception 'Only the team head can reopen an item';
    end if;
  end if;

  return new;
end;
$$;

create trigger rota_checklist_progress_guard
  before insert or update on public.rota_checklist_progress
  for each row execute function public.rota_checklist_guard();
