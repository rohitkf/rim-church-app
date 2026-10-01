/*
 * Heads and Admins can raise an issue at any time.
 *
 * 0118 held everybody to the window: from an hour before a service until
 * two hours after it. That window is for the people standing in the room,
 * so a stray "the projector was dodgy" a week later does not land on a
 * team's phone. A Head or an Admin who comes back on Tuesday with
 * something they noticed is doing the job of running the church, and the
 * window was stopping them. So it does not apply to an Admin, or to a
 * Head or Assisting Head of any team, before opening or after closing. It
 * does not apply to a service with no running order yet either, for them.
 *
 * Everybody else is still held to the window. Who may raise one at all is
 * still App settings' call (may_raise_issue), for everybody.
 *
 * Only `raise_issue` changes, and it keeps its signature.
 */

/* Whether this person raises issues free of the window: an Admin, or a Head of any team. */
create or replace function public.raises_issues_any_time(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or exists (
      select 1 from public.user_roles r
      where r.user_id = uid and r.role_type in ('department_head', 'assisting_head')
    )
  );
$$;

revoke all on function public.raises_issues_any_time(uuid) from public, anon;
grant execute on function public.raises_issues_any_time(uuid) to authenticated;

create or replace function public.raise_issue(
  service uuid,
  team uuid,
  title text,
  details text default null,
  as_team uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  made uuid;
  w record;
begin
  if not public.may_raise_issue(auth.uid()) then
    raise exception 'Raising issues is not open to you — App settings say who may.'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.services where id = service) then
    raise exception 'That service is not there any more.';
  end if;

  if not public.raises_issues_any_time(auth.uid()) then
    select * into w from public.issue_window(service);
    if w.opens_at is null or w.closes_at is null then
      raise exception 'That service has no running order yet, so there is nothing to raise an issue against.';
    end if;
    if now() < w.opens_at then
      raise exception 'Issues for this service can be raised from %.',
        to_char(w.opens_at at time zone public.church_timezone(), 'HH24:MI on FMDay DD FMMonth')
        using errcode = '42501';
    end if;
    if now() > w.closes_at then
      raise exception 'This service closed for issues at %.',
        to_char(w.closes_at at time zone public.church_timezone(), 'HH24:MI on FMDay DD FMMonth')
        using errcode = '42501';
    end if;
  end if;

  if title is null or length(btrim(title)) = 0 then
    raise exception 'An issue needs a line saying what is wrong.';
  end if;
  if as_team is not null
     and not public.is_dept_member(auth.uid(), as_team)
     and not public.is_dept_head_or_assisting(auth.uid(), as_team) then
    raise exception 'You can only raise an issue as a team you are on.' using errcode = '42501';
  end if;

  insert into public.service_issues
    (service_id, department_id, title, details, raised_by, raised_by_department_id)
  values (service, team, btrim(title), nullif(btrim(coalesce(details, '')), ''), auth.uid(), as_team)
  returning id into made;

  perform public.notify_people(
    array(
      select user_id from public.department_members where department_id = team
      union
      select user_id from public.user_roles
      where department_id = team and role_type in ('department_head', 'assisting_head')
    ),
    'service_issue',
    made,
    btrim(title)
  );
  return made;
end;
$$;

revoke all on function public.raise_issue(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.raise_issue(uuid, uuid, text, text, uuid) to authenticated;
