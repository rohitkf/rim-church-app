-- ============================================================================
-- Department roles
-- ============================================================================
-- The set of jobs a team fills at a service (Cameraman, Sound Desk,
-- Usher…), maintained by that team's head on the Teams page and offered
-- as the choices when building the Team Rota.
--
-- rota_assignments keeps its own role_label text rather than pointing at a
-- row here: the rota is a record of who did what on a given Sunday, and
-- renaming or retiring a role later shouldn't rewrite past services.
create table public.department_roles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (department_id, name)
);

alter table public.department_roles enable row level security;

create index department_roles_department_idx on public.department_roles (department_id);

-- Readable by every signed-in user: a head arranging cover needs to see
-- what another team's roles are called, the same as the rota itself.
create policy department_roles_select on public.department_roles
  for select using (auth.uid() is not null);

-- Maintained by that department's head, or Admin.
create policy department_roles_write on public.department_roles
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );
