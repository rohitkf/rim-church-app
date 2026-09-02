-- ============================================================================
-- One group per role, after all
-- ============================================================================
--
-- 0072 made membership plural. In use it reads as redundancy rather than
-- structure: the same role appearing under two headings makes the card
-- longer without making it clearer, and every question the page answers —
-- where does Drums 2 live, what is in the Band — has two answers where one
-- would do. A role has one home.
--
-- 0072 is left in the history rather than edited away. It was applied to
-- the real database, and a migration log that quietly loses a step is a
-- log nobody can trust to rebuild anything.
--
-- Nothing is lost coming back. No role had joined more than one group, so
-- restoring the column is exact rather than a choice about which
-- membership to keep — verified before running this.

alter table public.department_roles
  add column if not exists group_id uuid
    references public.department_role_groups(id) on delete set null;

create index if not exists department_roles_group_idx
  on public.department_roles (group_id);

-- Back into the column. `min` only has to break a tie that does not exist:
-- were one ever to appear, keeping the earliest is better than failing the
-- migration and leaving the table half-shaped.
update public.department_roles r
   set group_id = m.group_id
  from (
    select role_id, min(group_id::text)::uuid as group_id
    from public.department_role_group_members
    group by role_id
  ) m
 where m.role_id = r.id
   and r.group_id is null;

drop table if exists public.department_role_group_members;
