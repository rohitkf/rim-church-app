/*
 * Answers can close a number of hours before the service, instead of at a
 * time the night before (asked for by the Owner, November 2026).
 *
 * Since 0092 the window for saying whether you can serve closes on the
 * service's eve, at a time the church sets (23:59 out of the box). That
 * is one clock for every service, whenever it starts: a Sunday evening
 * service closes at the same Saturday midnight as the morning one, most
 * of a day early, and nothing could close two days ahead or two hours.
 *
 * Now the church chooses which it means, in Settings › Page by Page ›
 * Availability:
 *
 *   availability_closes_mode    'clock'  the night before, at
 *                                        availability_closes_time — as it
 *                                        has been, and still the default
 *                               'hours'  availability_closes_hours before
 *                                        the service begins
 *   availability_closes_hours   1 to 168 (a week); 12 out of the box, and
 *                               read only in 'hours'
 *
 * A service begins when its first session does. One nobody has planned
 * yet has no sessions and so no beginning: it keeps the night-before
 * deadline, as 0092 gave it, rather than staying open for ever — which is
 * the bug that migration closed and this one must not reopen. Once the
 * running order is there, the deadline is counted from it, and moves if
 * the first session's time is moved.
 *
 * Everything that asks when answers close asks availability_closes_at()
 * or availability_is_closed(): the three policies on `availability`, the
 * late-answer requests, the history's "after the deadline" mark, the
 * reminder and what is asked of me. So this is the two columns and the
 * one function; nothing else moves. Out of the box nothing changes at
 * all: the mode starts as 'clock'.
 *
 * The app already in production reads neither column and works the
 * deadline out from the time alone, so it agrees with the database until
 * somebody chooses 'hours' — which only the app that ships with this can.
 */

alter table public.app_settings
  add column if not exists availability_closes_mode text not null default 'clock'
    constraint app_settings_availability_closes_mode_check check (availability_closes_mode in ('clock', 'hours')),
  add column if not exists availability_closes_hours integer not null default 12
    constraint app_settings_availability_closes_hours_check check (availability_closes_hours between 1 and 168);

comment on column public.app_settings.availability_closes_mode is
  'How the deadline for availability answers is said: ''clock'' (the night before, at availability_closes_time) or ''hours'' (availability_closes_hours before the service''s first session). Read by availability_closes_at().';
comment on column public.app_settings.availability_closes_hours is
  'Hours before the service begins that availability answers close, when availability_closes_mode is ''hours''.';

create or replace function public.availability_closes_at(svc_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    -- Hours before it begins, where it has a beginning. The running order
    -- is only looked at in this mode: this is asked for every row a policy
    -- reads, and the night-before rule needs nothing but the date.
    when a.availability_closes_mode = 'hours' then
      coalesce(
        (select min(ss.start_time) from public.service_sessions ss where ss.service_id = s.id)
          - make_interval(hours => a.availability_closes_hours),
        ((s.date - 1) + coalesce(a.availability_closes_time, time '23:59')) at time zone public.church_timezone()
      )
    else ((s.date - 1) + coalesce(a.availability_closes_time, time '23:59')) at time zone public.church_timezone()
  end
  from public.services s
  left join public.app_settings a on true
  where s.id = svc_id;
$$;
select public.migration_done(309, '0309_answers_can_close_hours_before_the_service', 'bdbb388a1eb3bbd0b0735d1b76a2e00b4190b2b3825587d25e66dea4d0853926');
