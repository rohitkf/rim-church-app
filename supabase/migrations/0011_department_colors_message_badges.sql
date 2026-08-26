-- ============================================================================
-- Department colors + message designation badges
-- ============================================================================
-- Admins assign each department a color; message board posts carry the
-- department the author posted as, and the board renders it as a colored
-- "[Media Team]"-style badge next to the author's name.
alter table public.departments add column color text;

alter table public.messages
  add column department_id uuid references public.departments(id) on delete set null;

-- The board is readable by every signed-in user, so the department
-- name/color join on each message must be too — otherwise the badge would
-- only render for that department's own members. Department names and
-- colors aren't sensitive (department-owned CONTENT — roster, handbook
-- file, inventory — keeps its scoped policies); widen the departments
-- listing to all authenticated users.
drop policy departments_select on public.departments;
create policy departments_select on public.departments
  for select using (auth.uid() is not null);
