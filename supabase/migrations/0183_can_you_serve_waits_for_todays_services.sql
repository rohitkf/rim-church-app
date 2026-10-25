/*
 * "Can you serve?" waits until today's services are over.
 *
 * The dashboard's reminders (0178) asked about next week's services from
 * the moment they came into the rota window — including on the morning of
 * this week's, with the doors not yet open. Asking somebody about next
 * Sunday while they are setting up for this one is noise, and it pushed
 * what matters today down the page.
 *
 * So an availability reminder for a later day is held while any service
 * today has not yet ended, and appears once the last of them has. Ended
 * is service_ended_at: End service if it was pressed, otherwise the
 * planned end of the last session — the same moment the planner, the rota
 * and every other page call a service over. Polls and mentions are
 * unchanged.
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
    -- Not while today's services are still on: next week's question waits
    -- until the last one today has ended (End service, or its last
    -- session's planned end — service_ended_at, the moment every page
    -- calls a service over). A service with no running order holds
    -- nothing back.
    and not exists (
      select 1 from public.services t
      where t.date = (now() at time zone public.church_timezone())::date
        and t.date < s.date
        and public.service_ended_at(t.id) > now()
    )
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
