/*
 * Church events go sixty days after they end.
 *
 * Every other dated thing in the app has a clock (0128–0131), but the
 * church diary's own events were kept for ever: a youth weekend from three
 * years ago stayed in church_events, and only the screen stopped showing
 * it. Now an event is deleted church_event_retention_days after it ends —
 * its last day (ends_on), or its only day (event_date) — sixty out of the
 * box, chosen in Settings › Page by Page › Events, or null to keep them
 * for ever.
 *
 * apply_retention() (0131), run nightly at 03:00, does it, with the rest.
 * Birthdays, anniversaries and services in the diary are not events, so
 * this does not touch them. On production when this was applied, no event
 * had ended more than sixty days before; the first to go does so on
 * 4 November 2026.
 */

alter table public.app_settings
  add column if not exists church_event_retention_days integer default 60
    check (church_event_retention_days is null or church_event_retention_days between 1 and 3650);

update public.app_settings set church_event_retention_days = 60 where church_event_retention_days is null;

comment on column public.app_settings.church_event_retention_days is
  'Days after a church event ends that it is deleted; null keeps them for ever (0219).';

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

  -- A church event goes this long after its last day (0219).
  if s.church_event_retention_days is not null then
    delete from public.church_events
    where coalesce(ends_on, event_date) < today - s.church_event_retention_days;
  end if;
end;
$$;

notify pgrst, 'reload schema';
