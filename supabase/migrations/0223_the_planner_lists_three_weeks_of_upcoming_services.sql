/*
 * The planner lists three weeks of upcoming services.
 *
 * The Service Planner's Upcoming list showed every service for a year,
 * which with two repeating services a Sunday is a hundred rows. It once
 * stopped at a count (planner_upcoming_limit, 6), dropped when repeats
 * came in because a count spent itself on one busy fortnight; that
 * column has been read by nothing since.
 *
 * Now it is a span of days, like the rota's: planner_upcoming_days,
 * 21 out of the box, set in Settings › Page by Page › Service Planner.
 * Today's services and the next service day always show, however far
 * away; the calendar above still shows every month.
 */

alter table public.app_settings
  add column if not exists planner_upcoming_days integer not null default 21
    check (planner_upcoming_days between 1 and 365);

comment on column public.app_settings.planner_upcoming_days is
  'How many days ahead the Service Planner lists upcoming services (0223).';

notify pgrst, 'reload schema';
