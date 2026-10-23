/*
 * What is waiting on me.
 *
 * The bell says something happened, once, and is trimmed to the newest few
 * (0173). A request that needs an answer — a poll, whether you can serve,
 * somebody naming you on a board — should stay in front of you until it is
 * answered, so the dashboard keeps a reminder for each one. This is the one
 * list it reads, worked out from the things themselves rather than from the
 * bell, so a reminder goes the moment it is answered and cannot be lost to
 * the trim.
 *
 *   poll          — an open poll addressed to me (poll_recipients, 0177:
 *                   the same people it notified), that I did not ask and
 *                   have not answered. Gone when answered, closed or
 *                   cleared.
 *   availability  — a service in the rota window, still taking answers,
 *                   where a team I am core on has no answer from me — the
 *                   same people remind_unanswered_availability nudges
 *                   (0040). One row per service, every such team named.
 *   mention       — somebody named me on a team board and I have not
 *                   opened it (the notification is still unread).
 *
 * Each row: what kind it is, the thing it is about, a line to show, a
 * second line, the day it is for, when it is due, and when it arrived. A new kind of
 * request is a new branch here and a new entry in the app's
 * lib/reminders.ts — nothing else.
 *
 * Asks about the caller only, so it is the app's to call.
 */

create or replace function public.my_open_requests()
returns table (
  kind text,
  ref_id uuid,
  title text,
  detail text,
  on_date date,
  due_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid)
  -- Polls asked of me.
  select 'poll'::text, p.id, p.question, null::text, null::date, p.closes_at, p.created_at
  from public.team_polls p, me
  where me.uid is not null
    and public.can_open_page(me.uid, 'polls')
    and p.created_by <> me.uid
    and p.clears_at > now()
    and (p.closes_at is null or p.closes_at > now())
    and me.uid = any (public.poll_recipients(p))
    and not exists (
      select 1 from public.team_poll_votes v where v.poll_id = p.id and v.user_id = me.uid
    )

  union all

  -- Can I serve? Asked of a team's core members.
  select 'availability'::text, s.id, s.service_type, string_agg(d.name, ', ' order by d.name),
         s.date, public.availability_closes_at(s.id), null::timestamptz
  from public.services s
  join public.department_members m on m.member_type = 'core'
  join public.departments d on d.id = m.department_id
  cross join me
  where me.uid is not null
    and m.user_id = me.uid
    and public.can_open_page(me.uid, 'availability')
    and s.date >= current_date
    and s.date <= current_date + coalesce((select rota_window_days from public.app_settings limit 1), 7)
    and not public.availability_is_closed(s.id)
    and not exists (
      select 1 from public.availability a
      where a.user_id = me.uid and a.department_id = m.department_id and a.service_id = s.id
    )
  group by s.id, s.service_type, s.date

  union all

  -- Named on a board, not yet opened.
  select 'mention'::text, n.reference_id, coalesce(n.body, ''), null::text, null::date, null::timestamptz, n.created_at
  from public.notifications n, me
  where me.uid is not null
    and n.user_id = me.uid
    and n.type = 'mention'
    and n.read_boolean = false;
$$;

revoke all on function public.my_open_requests() from public, anon;
grant execute on function public.my_open_requests() to authenticated;
