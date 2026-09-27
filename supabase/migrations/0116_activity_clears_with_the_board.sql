/*
 * The activity feed clears with the message board.
 *
 * The feed was meant to empty "every Tuesday with the message board"
 * (0041), and it did — on a Tuesday of its own, from a separate job with
 * the day written into it. When 0061 let the church choose the day the
 * board clears, the feed kept its Tuesday, so a church that moved the
 * board to Monday had two different weeks and a page that could not say
 * truthfully when either ended.
 *
 * So the one job that clears the board clears the feed as well, on the
 * day App settings names, and the feed's own job goes.
 */

create or replace function public.clear_message_board_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if extract(dow from (now() at time zone 'utc'))::int
     <> (select board_clear_dow from public.app_settings) then
    return;
  end if;
  delete from public.notifications where type = 'message';
  delete from public.messages where ctid is not null;
  delete from public.activity where ctid is not null;
end;
$function$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('rim-clear-activity')
      where exists (select 1 from cron.job where jobname = 'rim-clear-activity');
  end if;
end $$;
