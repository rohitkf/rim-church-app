-- ============================================================================
-- The database says when something changed
-- ============================================================================
-- Every list in the app was fetched when its page mounted and then left
-- alone. A head assigning somebody to Camera 2 saw it; the person being
-- assigned did not, until they refreshed or came back to the tab. On a
-- Sunday morning that is the difference between a rota and a rumour: the
-- running order moves, a session is skipped, twenty minutes are granted —
-- and every screen except the one that did it is describing a service that
-- has stopped happening.
--
-- Four tables were already published, because four features were written
-- with their own subscriptions: the activity feed, the notifications bell,
-- team chat and the board. This publishes the rest, and the app keeps one
-- socket open with a binding per table (see lib/useLiveData.ts).
--
-- **RLS still decides who hears what.** Realtime checks every row against
-- the subscriber's own policies before it sends it, so publishing a table
-- gives nobody a row they could not already have fetched. The one gap is a
-- DELETE, which carries only the primary key of the row that went and is
-- not filtered — somebody learns that a row with that id no longer exists,
-- which is nothing they could not learn by asking for it again.
--
-- Replica identity is deliberately left alone. `full` would let Realtime
-- filter deletes too, at the cost of writing every column of every update
-- into the WAL for the whole church's traffic — a real price for hiding
-- the fact that an id stopped existing.
--
-- Deliberately not published: `push_subscriptions` (endpoints and keys,
-- read by nothing on a page), `profile_sensitive` (the private half of a
-- profile, and the last thing that should travel on a socket), and
-- `app_owner` (one row, which changes about once a year).

do $$
declare
  t text;
  wanted text[] := array[
    -- The Sunday itself
    'services', 'service_sessions', 'service_guests', 'set_list_items',
    'church_events', 'service_templates', 'service_template_sessions',
    -- Who is on, and whether they have done it
    'rota_assignments', 'rota_release_requests', 'rota_checklist_progress',
    'checklist_items', 'checklists', 'availability', 'attendance',
    'department_call_times',
    -- Teams and the people on them
    'department_members', 'departments', 'department_roles',
    'department_role_checklist_items', 'department_role_groups',
    'team_join_requests', 'user_roles', 'profiles', 'invitations',
    'ownership_transfers',
    -- The store cupboard
    'inventory_items', 'inventory_categories', 'inventory_events',
    'inventory_documents', 'purchase_requests',
    -- Settings everyone reads
    'app_settings', 'announcements'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array wanted loop
    -- Skipped rather than failed for a table that is not here: this list
    -- is read by a person, and a typo in it should not stop a deploy.
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      raise notice 'no such table, skipping: %', t;
      continue;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
