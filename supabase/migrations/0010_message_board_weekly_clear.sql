-- ============================================================================
-- Weekly message board reset
-- ============================================================================
-- The message board is a rolling announcements space for the upcoming
-- service, not an archive: every Tuesday at 00:00 UTC (two days after the
-- Sunday service) pg_cron wipes all posts, along with the 'message'-type
-- notifications that reference them so the bell never points at deleted
-- rows.
--
-- pg_cron ships with Supabase but not with a bare Postgres image (used to
-- dry-run these migrations in CI), so both the extension and the schedule
-- are guarded on its availability rather than assumed.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'clear-message-board',
      '0 0 * * 2', -- Tuesdays 00:00 UTC
      $job$
        delete from public.notifications where type = 'message';
        delete from public.messages;
      $job$
    );
  else
    raise notice 'pg_cron unavailable; skipping message board clear schedule';
  end if;
end $$;
