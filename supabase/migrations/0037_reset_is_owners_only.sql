-- ============================================================================
-- Wiping the church's data is the owner's alone
-- ============================================================================
-- Reset exists so features can be tried on a clean slate, and it deletes
-- real records: every service, every checklist, every answer people gave.
-- Any Admin could call it. Admin is a job several people hold and is handed
-- out freely — the one irreversible button in the app should not be part of
-- that job. It belongs with ownership, which is deliberately held by one
-- account and moves only by being offered and accepted.
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
end;
$$;
