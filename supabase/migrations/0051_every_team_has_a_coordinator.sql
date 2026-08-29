-- ============================================================================
-- Coordinator: a role every team has, whose holder can verify the checklist
-- ============================================================================
--
-- A checklist item passes through three hands: the member who does the job
-- marks it done, someone over the team verifies it, and the Service Flow
-- signer closes it off. The middle step was the Department Head's (and,
-- since 0018, the Assisting Head's) — which stalls whenever neither is in
-- the building.
--
-- So every team now carries a role called Coordinator, and whoever the
-- rota puts in it for a service can verify that team's checklist for that
-- service. It is deliberately scoped to the one service they are rostered
-- on: a Coordinator is who is holding the team that morning, not a
-- standing rank, which is why it lives on the rota rather than in
-- user_roles.

-- 1. Every team has one. Idempotent, so it is safe to call on a team that
--    already made its own — Media had already added a Coordinator by hand.
create or replace function public.ensure_coordinator_role(dept_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.department_roles (department_id, name)
  values (dept_id, 'Coordinator')
  on conflict (department_id, name) do nothing;
$$;

-- Backfill the teams that already exist.
insert into public.department_roles (department_id, name)
select d.id, 'Coordinator' from public.departments d
on conflict (department_id, name) do nothing;

-- And every team made from here on.
create or replace function public.add_coordinator_role_to_new_department()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_coordinator_role(new.id);
  return new;
end;
$$;

drop trigger if exists departments_get_a_coordinator on public.departments;
create trigger departments_get_a_coordinator
  after insert on public.departments
  for each row execute function public.add_coordinator_role_to_new_department();

-- 2. Who is coordinating the team this checklist item belongs to, on the
--    service it belongs to. Compared case-insensitively because the role
--    is a text label on the rota, and a head renaming it "coordinator"
--    should not quietly revoke the right.
create or replace function public.is_rota_coordinator(uid uuid, assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rota_assignments target
    join public.rota_assignments mine
      on mine.service_id = target.service_id
     and mine.department_id = target.department_id
    where target.id = assignment_id
      and mine.user_id = uid
      and lower(mine.role_label) = 'coordinator'
  );
$$;

-- 3. The Coordinator joins the people who may work that checklist. The
--    finished-service guard from 0047 still comes first: once a service is
--    over, nobody edits it.
drop policy if exists rota_checklist_progress_select on public.rota_checklist_progress;
create policy rota_checklist_progress_select on public.rota_checklist_progress
  for select using (
    auth.uid() = public.rota_assignment_user(assignment_id)
    or public.can_view_department_content(auth.uid(), public.rota_assignment_department(assignment_id))
    or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
    or public.is_any_coordinator(auth.uid())
    or public.is_rota_coordinator(auth.uid(), assignment_id)
  );

drop policy if exists rota_checklist_progress_write on public.rota_checklist_progress;
create policy rota_checklist_progress_write on public.rota_checklist_progress
  for all using (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or auth.uid() = public.rota_assignment_user(assignment_id)
      or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
      or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
      or public.is_rota_coordinator(auth.uid(), assignment_id)
    )
  )
  with check (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or auth.uid() = public.rota_assignment_user(assignment_id)
      or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
      or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
      or public.is_rota_coordinator(auth.uid(), assignment_id)
    )
  );

-- 4. Reset puts the Coordinator back.
--
--    Clear activity never touched department_roles, so it already survived
--    there. Clear everything deletes the teams themselves, and the trigger
--    above hands a Coordinator to each new one — but re-seeding at the end
--    of the reset makes the guarantee hold whatever survives, rather than
--    depending on which tables a future edit to this list happens to name.
create or replace function public.admin_reset_data(include_setup boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_tables constant text[] := array[
    'rota_release_requests',
    'rota_checklist_progress',
    'rota_assignments',
    'availability',
    'checklist_items',
    'checklists',
    'attendance',
    'service_sessions',
    'department_call_times',
    'services',
    'messages',
    'notifications'
  ];
  setup_tables constant text[] := array[
    'inventory_events',
    'inventory_items',
    'service_template_sessions',
    'service_templates',
    'department_role_checklist_items',
    'department_roles',
    'department_members',
    'departments'
  ];
  t text;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can reset the app data';
  end if;

  foreach t in array activity_tables loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('delete from public.%I where ctid is not null', t);
    end if;
  end loop;

  if include_setup then
    foreach t in array setup_tables loop
      if to_regclass('public.' || quote_ident(t)) is not null then
        execute format('delete from public.%I where ctid is not null', t);
      end if;
    end loop;

    -- Everyone but the caller. Their profile, grants and remaining rows
    -- follow by cascade from auth.users. The owner is the caller here, so
    -- ownership itself survives.
    delete from auth.users where id <> auth.uid();
    delete from public.user_roles where user_id <> auth.uid();
  end if;

  -- Whatever teams are left, each still has its Coordinator.
  insert into public.department_roles (department_id, name)
  select d.id, 'Coordinator' from public.departments d
  on conflict (department_id, name) do nothing;
end;
$$;
