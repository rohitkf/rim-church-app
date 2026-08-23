-- ============================================================================
-- Realtime (FR15.2 — live notification bell; also backs a live message
-- board and could later back live checklist views).
-- ============================================================================
-- A real Supabase project always has the `supabase_realtime` publication
-- pre-created; a bare Postgres instance (used to dry-run these migrations
-- in CI) does not, so this guards both creating the publication and adding
-- each table to it, rather than assuming either already holds.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
