-- ============================================================================
-- Admin: reset the app's data for testing
-- ============================================================================
-- Two levels, because "start fresh" usually means one of two things:
--
--   activity only  — services and everything hanging off them, messages,
--                    availability, rota, inventory, templates. Teams,
--                    roles and people survive, so the next test starts
--                    with the setup already in place.
--   include setup  — the above plus teams, their roles and role
--                    checklists, and every other account.
--
-- The caller is never deleted: an Admin who wiped their own account would
-- be left signed in to nothing, with no way back in and possibly no Admin
-- left at all. Uploaded files (handbooks, avatars) live in Storage, not
-- the database, so they are not touched here.
create function public.admin_reset_data(include_setup boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can reset the app data';
  end if;

  -- Order matters only where a table has no cascade from what follows;
  -- deleting services alone would take most of this with it, but being
  -- explicit keeps the intent readable.
  delete from public.rota_release_requests;
  delete from public.rota_checklist_progress;
  delete from public.rota_assignments;
  delete from public.availability;
  delete from public.checklist_items;
  delete from public.checklists;
  delete from public.attendance;
  delete from public.service_sessions;
  delete from public.department_call_times;
  delete from public.services;
  delete from public.messages;
  delete from public.notifications;
  delete from public.inventory_items;
  delete from public.service_template_sessions;
  delete from public.service_templates;

  if include_setup then
    delete from public.department_role_checklist_items;
    delete from public.department_roles;
    delete from public.department_members;
    delete from public.departments;

    -- Everyone but the caller. Their profile, grants and remaining rows
    -- follow by cascade from auth.users.
    delete from auth.users where id <> auth.uid();
    delete from public.user_roles where user_id <> auth.uid();
  end if;
end;
$$;

revoke all on function public.admin_reset_data(boolean) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.admin_reset_data(boolean) to authenticated;
  end if;
end $$;
