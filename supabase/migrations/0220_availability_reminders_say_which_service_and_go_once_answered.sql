/*
 * Availability reminders say which service and team, come once, and go
 * once answered.
 *
 * People told us the Remind button "reminds people who have already
 * answered". On production the reminders bore that out, three ways:
 *
 *   - A reminder stayed in the bell after its answer. Of the last two
 *     weeks' 245, 72 were answered after they were sent and still sat
 *     there, saying "Your team is waiting on you". Of all 345 kept, 106
 *     were for a service the person had since answered for every team.
 *   - It never said which service or which team. Every Sunday has an
 *     English and a Malayalam service, and some people serve on two
 *     teams: somebody who had answered for the English service, or for
 *     one of their teams, was asked again and could not tell it was about
 *     the other one.
 *   - It came more than once. The nightly reminder wrote one per team, not
 *     one per person, and skipped only a reminder from the last 20 hours
 *     though it runs 24 hours apart, on Friday and Saturday; the button
 *     skipped one from the last six. 85 person-and-service pairs had
 *     several.
 *
 * So:
 *
 *   availability_reminder_text(uid, svc)  "Can you serve at the Malayalam
 *       Service on Sunday 1 November? Worship is waiting on your answer."
 *       — the teams named are those still without an answer from them.
 *       Null when there are none.
 *   nudge_availability(dept, svc)  as before (same permission and the
 *       same "finished" refusal), but each reminder carries that text,
 *       and nobody with an unread reminder for the service gets another.
 *   remind_unanswered_availability()  one reminder per person per
 *       service, with the text; not to somebody with an unread one for it,
 *       nor one from the last six days; only while answers are open and
 *       only to people who can open Availability; "the next three days"
 *       counted in the church's timezone.
 *   tidy_availability_reminders(uid, svc)  after somebody answers: their
 *       reminders for that service are deleted when no team is waiting,
 *       or say only the teams still waiting. Run by a trigger on
 *       availability, and once now for every reminder on file.
 *
 * Who is asked, and who may press Remind, are unchanged.
 */

create or replace function public.availability_reminder_text(uid uuid, svc uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with waiting as (
    select d.name
    from public.department_members m
    join public.departments d on d.id = m.department_id
    where m.user_id = uid
      and m.member_type = 'core'
      and not exists (
        select 1 from public.availability a
        where a.user_id = uid and a.department_id = m.department_id and a.service_id = svc
      )
  ), named as (
    select count(*) as n,
           array_agg(name order by name) as names
    from waiting
  )
  select case when named.n = 0 then null else
    format(
      'Can you serve at the %s on %s? %s %s waiting on your %s.',
      s.service_type,
      to_char(s.date, 'FMDay FMDD FMMonth'),
      case when named.n = 1 then named.names[1]
           else array_to_string(named.names[1:named.n - 1], ', ') || ' and ' || named.names[named.n] end,
      case when named.n = 1 then 'is' else 'are' end,
      case when named.n = 1 then 'answer' else 'answers' end
    ) end
  from named, public.services s
  where s.id = svc;
$$;

revoke all on function public.availability_reminder_text(uuid, uuid) from public, anon, authenticated;

create or replace function public.nudge_availability(dept_id uuid, svc_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  if not public.may(auth.uid(), 'avail.nudge', dept_id, svc_id) then
    raise exception 'Nudging that team is not open to you.';
  end if;
  if public.service_has_finished(svc_id) then
    raise exception 'That service has finished — there is nothing left to answer for.';
  end if;

  insert into public.notifications (user_id, type, reference_id, body)
  select w.user_id, 'availability_reminder', svc_id, public.availability_reminder_text(w.user_id, svc_id)
  from public.awaiting_availability(dept_id, svc_id) w
  where w.user_id <> auth.uid()
    -- One unread reminder per person per service, whichever team asked.
    and not exists (
      select 1 from public.notifications n
      where n.user_id = w.user_id
        and n.type = 'availability_reminder'
        and n.reference_id = svc_id
        and (n.read_boolean = false or n.created_at > now() - interval '6 hours')
    );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

create or replace function public.remind_unanswered_availability()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer := 0;
  sent integer;
  svc record;
  today date := (now() at time zone public.church_timezone())::date;
begin
  for svc in
    select id from public.services
    where date >= today and date <= today + 3
      and not public.availability_is_closed(id)
  loop
    insert into public.notifications (user_id, type, reference_id, body)
    select w.user_id, 'availability_reminder', svc.id, public.availability_reminder_text(w.user_id, svc.id)
    from (
      select distinct m.user_id
      from public.department_members m
      where m.member_type = 'core'
        and not exists (
          select 1 from public.availability a
          where a.user_id = m.user_id
            and a.department_id = m.department_id
            and a.service_id = svc.id
        )
    ) w
    where public.can_open_page(w.user_id, 'availability')
      and not exists (
        select 1 from public.notifications n
        where n.user_id = w.user_id
          and n.type = 'availability_reminder'
          and n.reference_id = svc.id
          and (n.read_boolean = false or n.created_at > now() - interval '6 days')
      );
    get diagnostics sent = row_count;
    total := total + sent;
  end loop;
  return total;
end;
$$;

revoke all on function public.remind_unanswered_availability() from public, anon, authenticated;

create or replace function public.tidy_availability_reminders(uid uuid, svc uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  still text := public.availability_reminder_text(uid, svc);
begin
  if still is null then
    delete from public.notifications
    where user_id = uid and type = 'availability_reminder' and reference_id = svc;
  else
    update public.notifications set body = still
    where user_id = uid and type = 'availability_reminder' and reference_id = svc
      and body is distinct from still;
  end if;
end;
$$;

revoke all on function public.tidy_availability_reminders(uuid, uuid) from public, anon, authenticated;

create or replace function public.availability_tidies_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tidy_availability_reminders(new.user_id, new.service_id);
  return null;
end;
$$;

revoke all on function public.availability_tidies_reminders() from public, anon, authenticated;

drop trigger if exists availability_tidies_reminders on public.availability;
create trigger availability_tidies_reminders
  after insert on public.availability
  for each row execute function public.availability_tidies_reminders();

-- Every reminder on file, tidied once: answered ones go, the rest name
-- the service and the teams still waiting.
do $tidy$
declare r record;
begin
  for r in select distinct user_id, reference_id from public.notifications
           where type = 'availability_reminder' and reference_id is not null loop
    perform public.tidy_availability_reminders(r.user_id, r.reference_id);
  end loop;
end $tidy$;

notify pgrst, 'reload schema';
