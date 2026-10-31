/*
 * Remind everyone who has not answered for a service.
 *
 * Remind on the Availability page chases one team. An Admin or the Owner
 * looking at a whole service had to press it team by team. Now
 * nudge_availability_all(svc) reminds every core member of every team who
 * has not answered for that service, once each, with the same words as
 * the team's Remind (0220): the service, its day and the teams still
 * waiting.
 *
 * Who may: whoever may remind everywhere — may(..., 'avail.nudge') asked
 * with no team, which the Owner and Admins pass out of the box, and a
 * Head only if the church gives their cell Everywhere. Like the team's
 * Remind it refuses a finished service, skips the person pressing it, and
 * skips anybody who already has an unread reminder for the service or
 * one from the last six hours.
 */

create or replace function public.nudge_availability_all(svc_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  if not public.may(auth.uid(), 'avail.nudge', null, svc_id) then
    raise exception 'Reminding every team is not open to you.' using errcode = '42501';
  end if;
  if public.service_has_finished(svc_id) then
    raise exception 'That service has finished — there is nothing left to answer for.';
  end if;

  insert into public.notifications (user_id, type, reference_id, body)
  select w.user_id, 'availability_reminder', svc_id, public.availability_reminder_text(w.user_id, svc_id)
  from (
    select distinct m.user_id
    from public.department_members m
    where m.member_type = 'core'
      and not exists (
        select 1 from public.availability a
        where a.user_id = m.user_id and a.department_id = m.department_id and a.service_id = svc_id
      )
  ) w
  where w.user_id <> auth.uid()
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

revoke all on function public.nudge_availability_all(uuid) from public, anon;
grant execute on function public.nudge_availability_all(uuid) to authenticated;

notify pgrst, 'reload schema';
