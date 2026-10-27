/*
 * The change log is no longer read for screens.
 *
 * Since 0202 every screen hears that a table changed from a broadcast,
 * and nothing in the app subscribes to Postgres Changes any more. While a
 * table stays in the `supabase_realtime` publication, Realtime still
 * decodes its changes for any subscriber left over from an older copy of
 * the app. So every table leaves it. The publication itself stays, empty,
 * because Realtime expects to find it.
 *
 * Applied only once the release that listens to `live` was in production
 * (AGENTS.md §7.3): before that, a screen already open would have gone
 * quiet until it was reloaded.
 *
 * Guarded: CI's bare Postgres has no publication.
 */

do $pub$
declare
  t record;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  for t in
    select schemaname, tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table %I.%I', t.schemaname, t.tablename);
  end loop;
end $pub$;
