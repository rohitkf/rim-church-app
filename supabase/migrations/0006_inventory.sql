-- ============================================================================
-- Inventory (Section 13)
-- ============================================================================
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  quantity int not null default 0,
  status text,
  location text,
  last_checked date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

create trigger inventory_items_touch_updated_at
  before update on public.inventory_items
  for each row execute function public.touch_updated_at();

-- FR13.2: visible to department core+guest members, that department's
-- head/assisting head, and Admin (who sees all). Inventory is department-
-- owned content like the roster/handbook, so it does NOT get the
-- cross-department dashboard exception that attendance/checklist metrics do.
create policy inventory_items_select on public.inventory_items
  for select using (public.can_view_department_content(auth.uid(), department_id));

-- FR13.1: add/modify/delete scoped per department — Head only (Assisting
-- Head is view-only per Open Question 1 decision).
create policy inventory_items_write on public.inventory_items
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );
