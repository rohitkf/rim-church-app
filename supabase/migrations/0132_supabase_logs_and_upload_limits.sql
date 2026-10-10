/*
 * Supabase's own logs keep a week, and uploads get tighter limits (5 of
 * 5, after 0128).
 *
 * The webhook log (one row per phone notification sent) and pg_cron's
 * run history are never pruned by Supabase; every Tuesday at 03:30 UTC
 * anything over a week old goes.
 *
 * Per-file limits, enforced by the buckets; lib/uploadLimits.ts checks
 * the same numbers before uploading.
 */

create or replace function public.prune_platform_logs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  if to_regclass('supabase_functions.hooks') is not null then
    delete from supabase_functions.hooks where created_at < now() - interval '7 days';
  end if;
end;
$$;

revoke all on function public.prune_platform_logs() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-platform-logs';
    perform cron.schedule('prune-platform-logs', '30 3 * * 2', 'select public.prune_platform_logs();');
  end if;
end $cron$;

do $buckets$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set file_size_limit = 2 * 1024 * 1024 where id = 'branding';
    update storage.buckets set file_size_limit = 2 * 1024 * 1024 where id = 'giving';
    update storage.buckets set file_size_limit = 10 * 1024 * 1024 where id = 'handbooks';
    update storage.buckets set file_size_limit = 5 * 1024 * 1024 where id = 'inventory-docs';
    update storage.buckets
      set file_size_limit = 2 * 1024 * 1024,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
      where id = 'avatars';
  end if;
end $buckets$;

notify pgrst, 'reload schema';
