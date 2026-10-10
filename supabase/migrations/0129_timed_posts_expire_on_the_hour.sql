/*
 * Timed posts expire on the hour (2 of 5, after 0128).
 *
 * Church Updates past their end and polls past their clear time are
 * already hidden by their select policies (0128); this frees the rows,
 * every hour at :05.
 */

create or replace function public.expire_timed_posts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.church_updates where ends_at <= now();
  delete from public.team_polls where clears_at <= now();
end;
$$;

revoke all on function public.expire_timed_posts() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'expire-timed-posts';
    perform cron.schedule('expire-timed-posts', '5 * * * *', 'select public.expire_timed_posts();');
  end if;
end $cron$;

notify pgrst, 'reload schema';
