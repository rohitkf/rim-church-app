/*
 * The sent-alerts record clears on its own day (3 of 5, after 0128).
 *
 * At 00:00 UTC on alert_clear_dow (Tuesday by default; null never), the
 * list of alerts that were sent is emptied. A job of its own rather than
 * a line in the board's: the two days are set separately, and the board's
 * job is left exactly as it was.
 */

create or replace function public.clear_sent_alerts_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  due smallint := (select alert_clear_dow from public.app_settings limit 1);
begin
  if due is not null and extract(dow from (now() at time zone 'utc'))::int = due then
    delete from public.announcements where ctid is not null;
  end if;
end;
$$;

revoke all on function public.clear_sent_alerts_if_due() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'clear-sent-alerts';
    perform cron.schedule('clear-sent-alerts', '0 0 * * *', 'select public.clear_sent_alerts_if_due();');
  end if;
end $cron$;

notify pgrst, 'reload schema';
