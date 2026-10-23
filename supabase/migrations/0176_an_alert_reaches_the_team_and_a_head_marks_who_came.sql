-- Two loose ends the audit's final reviewers left beside 0171.
--
-- 0171 made an availability answer a member's own only for a team they are
-- on, which is the door that let an outsider plant a row. But the alert
-- fan-out never asked who was on the team: a service-targeted alert goes to
-- the rota and to everybody with an "available" or "tentative" answer for
-- that team and service, and a row that is already there — left by somebody
-- who has since been taken off the team, or planted before 0171 — still
-- carries the alert's full text to them. The @-mention branch of the same
-- trigger has always filtered through the roster; the alert branch now does
-- too. Rota assignments need no filter: a Head put every one of them there.
--
-- Separately, `attended` is the Head's record of who came (0047), and the
-- page lets only leads mark it, yet the own-row branch of the update policy
-- let a member tick themselves present. The tracker only counts a mark by a
-- Head for a person on the roster, so the gain was small, but a record of
-- who turned up should not be writable by the person it is about. Changing
-- it now asks the same grid cell the page does: day.attendance.

create or replace function public.notify_on_team_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients uuid[];
begin
  if new.kind = 'alert' then
    if new.service_id is null then
      recipients := array(
        select user_id from public.department_members where department_id = new.department_id
      );
    else
      recipients := array(
        select user_id from public.rota_assignments
        where service_id = new.service_id and department_id = new.department_id
        union
        -- An answer counts only from somebody who is on the team today.
        select a.user_id from public.availability a
        join public.department_members m
          on m.department_id = a.department_id and m.user_id = a.user_id
        where a.service_id = new.service_id
          and a.department_id = new.department_id
          and a.status in ('available', 'tentative')
      );
    end if;

    perform public.notify_people(
      array(select unnest(recipients) except select new.author_id),
      'team_alert',
      new.id,
      new.body
    );
  elsif array_length(new.mentions, 1) is not null then
    -- Only people who can already read the room: an @ must not become a
    -- way to show an outsider what was said in it.
    perform public.notify_people(
      array(
        select m from unnest(new.mentions) as m
        where m <> new.author_id
          and (
            public.is_dept_member(m, new.department_id)
            or public.is_dept_head_or_assisting(m, new.department_id)
            or public.is_admin(m)
          )
      ),
      'mention',
      new.id,
      new.body
    );
  end if;

  return new;
end;
$$;

create or replace function public.availability_guard_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.attended is distinct from old.attended
     and auth.uid() is not null
     and not public.may(auth.uid(), 'day.attendance', old.department_id, old.service_id) then
    raise exception 'Only whoever records attendance for this team can mark who came.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.availability_guard_attendance() from public, anon, authenticated;

drop trigger if exists availability_guard_attendance on public.availability;
create trigger availability_guard_attendance
  before update of attended on public.availability
  for each row execute function public.availability_guard_attendance();

notify pgrst, 'reload schema';
