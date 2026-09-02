-- ============================================================================
-- A role can belong to more than one family
-- ============================================================================
--
-- 0071 gave each role a single group_id, on the reasoning that a role
-- drawn twice is a lie about how many of it there are. That was the wrong
-- reading. "Worship Leader 1" genuinely sits in both Worship Leaders and
-- Vocals; a backing vocal is Vocals and, at some churches, Band. Drawing
-- it under both headings is not two of the job, it is one job that belongs
-- to two families — the same way a person is in two departments without
-- there being two of them.
--
-- So membership moves out of the roles table and into its own, where
-- "belongs to" can be plural.
--
-- The old column is backfilled and dropped rather than left behind. Two
-- places recording the same fact is how they end up disagreeing, and there
-- is no version of this app where a role's one group and its several
-- groups are both authoritative.

create table if not exists public.department_role_group_members (
  role_id uuid not null references public.department_roles(id) on delete cascade,
  group_id uuid not null references public.department_role_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, group_id)
);

create index if not exists role_group_members_group_idx
  on public.department_role_group_members (group_id);

alter table public.department_role_group_members enable row level security;

-- Readable by anyone signed in, like the roles and the groups it joins.
drop policy if exists role_group_members_select on public.department_role_group_members;
create policy role_group_members_select on public.department_role_group_members
  for select using (auth.uid() is not null);

-- Written by whoever may shape the team's roles. The department is reached
-- through the role rather than stored again here: a membership row that
-- could name a different team from the role it points at is a row that can
-- be wrong, and this one cannot be.
--
-- Every column is qualified. Written bare, `group_id` inside the EXISTS
-- binds to department_roles.group_id — the very column this migration is
-- about to drop — rather than to the row being checked, which Postgres
-- reported as a dependency and refused. It would otherwise have been a
-- policy quietly asking the wrong question.
drop policy if exists role_group_members_write on public.department_role_group_members;
create policy role_group_members_write on public.department_role_group_members
  for all
  using (
    exists (
      select 1 from public.department_roles r
      where r.id = department_role_group_members.role_id
        and (
          public.is_admin(auth.uid())
          or public.is_dept_head_or_assisting(auth.uid(), r.department_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.department_roles r
      join public.department_role_groups g
        on g.id = department_role_group_members.group_id
      where r.id = department_role_group_members.role_id
        -- A role may only join a group belonging to its own team.
        and g.department_id = r.department_id
        and (
          public.is_admin(auth.uid())
          or public.is_dept_head_or_assisting(auth.uid(), r.department_id)
        )
    )
  );

-- Carry across what 0071 already filed.
insert into public.department_role_group_members (role_id, group_id)
select id, group_id from public.department_roles where group_id is not null
on conflict do nothing;

alter table public.department_roles drop column if exists group_id;
