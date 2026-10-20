-- The app hears a change the moment it lands (lib/useLiveData.ts): Postgres
-- publishes it, Realtime passes it to whoever may see it, and the screen
-- refetches. That only holds for tables in the `supabase_realtime`
-- publication, and the tables that arrived from 0145 on — a guest's answers
-- and rota rows, a team's guests, a family, the permission grid, the tour —
-- were never added. A Head putting a guest on the rota saw it; everybody
-- else saw the old rota until they refreshed.
--
-- Guarded twice: CI's bare Postgres has no publication at all, and a table
-- already published must not be added again.

do $pub$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'department_guests',
    'guest_availability',
    'guest_availability_history',
    'guest_rota_assignments',
    'availability_history',
    'households',
    'household_members',
    'family_link_requests',
    'role_permissions',
    'department_permissions',
    'onboarding'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $pub$;
