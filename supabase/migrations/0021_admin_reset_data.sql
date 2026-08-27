-- ============================================================================
-- Admin: reset the app's data for testing
-- ============================================================================
-- Two levels, because "start fresh" usually means one of two things:
--
--   activity only  — services and everything hanging off them (running
--                    orders, rota, checklist progress, availability,
--                    attendance) plus the message board. Everything that
--                    took setting up survives: teams, their roles and role
--                    checklists, membership, service templates, inventory
--                    and people — so the next test starts ready to go.
--   include setup  — the above plus teams, roles, membership, templates,
--                    inventory, and every other account.
--
-- The caller is never deleted: an Admin who wiped their own account would
-- be left signed in to nothing, with no way back in and possibly no Admin
-- left at all. Uploaded files (handbooks, avatars) live in Storage, not
-- the database, so they are not touched here.
--
-- The deletes run off a list rather than as literal statements. plpgsql
-- resolves table names at run time, so a single table that a database has
-- not been migrated far enough to have would abort the entire reset with
-- "relation does not exist" — and leave the Admin no way to clear the rest.
-- Skipping what isn't there keeps the reset working on any migration level.
--
-- Every delete carries `where ctid is not null` — always true, and true of
-- every row in any table. Supabase loads pg_safeupdate on the API roles,
-- which rejects an unqualified DELETE outright ("DELETE requires a WHERE
-- clause"); a bare `where true` is constant-folded away before the guard
-- sees it, but a ctid test survives into the plan.
create or replace function public.admin_reset_data(include_setup boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Ordered so a child is emptied before its parent. Most of these would
  -- cascade from services anyway; being explicit keeps the intent readable.
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
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can reset the app data';
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
