/*
 * Services go after two weeks (4 of 5, after 0128–0130).
 *
 * The nightly job (03:00 UTC), rewritten for the church's clocks: a
 * service and everything about it — every child table cascades: running
 * order, rota, availability, ticks, set lists, readiness, debriefs,
 * issues, polls about the service — after service_retention_days; bell
 * notifications by age (if set) and by each person's limit; team chat;
 * timed posts; settled feedback.
 *
 * The activity triggers on those child tables skip a service that is
 * being deleted (record_activity), so this does not flood the feed —
 * checked in the dry run.
 */

create or replace function public.apply_retention()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.app_settings%rowtype;
  today date;
begin
  select * into s from public.app_settings limit 1;
  if not found then
    return;
  end if;
  today := (now() at time zone public.church_timezone())::date;

  delete from public.services
  where date < today - s.service_retention_days;

  if s.notification_retention_days is not null then
    delete from public.notifications
    where created_at < now() - make_interval(days => s.notification_retention_days);
  end if;
  -- In case the limit was lowered since a person's last notification.
  perform public.keep_newest_notifications(null);

  if s.team_chat_retention_days is not null then
    delete from public.team_messages
    where created_at < now() - make_interval(days => s.team_chat_retention_days);
  end if;

  perform public.expire_timed_posts();

  if s.feedback_retention_days is not null then
    delete from public.app_feedback
    where status in ('done', 'wont_do')
      and coalesce(status_changed_at, created_at) < now() - make_interval(days => s.feedback_retention_days);
  end if;
end;
$$;

revoke all on function public.apply_retention() from public, anon, authenticated;

notify pgrst, 'reload schema';
