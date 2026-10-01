/*
 * Issues: a window to raise them in, and a Head's verdict on each.
 *
 * 0117 let anybody raise an issue against any service at any time, and
 * let anybody on the team it was for mark it done. In use, an issue is
 * something seen *at* a service, so it can be raised only while that
 * service is happening: from `issue_open_minutes_before` its first session
 * starts (an hour, unless changed) until `issue_close_minutes_after` it
 * ends (two hours) — "ends" being End service if it was pressed, otherwise
 * the planned end of its last session (`service_ended_at`, 0115).
 *
 * The verdict is the team's Head's (or an Admin's), and it is one of
 * three, with remarks if they want to say more:
 *   resolved      — fixed. Deleted `issue_retention_days` after marking.
 *   not_resolved  — looked at, still broken. Kept until it is resolved.
 *   persistent    — keeps coming back. Kept until it is resolved.
 *
 * Once a Head has given a verdict the issue is a record, so only an Admin
 * may delete it; until then the person who raised it may still take it
 * back.
 *
 * `resolved_at`/`resolved_by` become `marked_at`/`marked_by`, because a
 * verdict of "not resolved" with a column called resolved_at would be the
 * first thing to mislead whoever reads this next. The table was empty in
 * production when this was written.
 */

alter table public.app_settings
  add column if not exists issue_open_minutes_before integer not null default 60
    check (issue_open_minutes_before between 0 and 720),
  add column if not exists issue_close_minutes_after integer not null default 120
    check (issue_close_minutes_after between 0 and 1440);

alter table public.service_issues rename column resolved_at to marked_at;
alter table public.service_issues rename column resolved_by to marked_by;
-- A renamed column keeps its constraint's old name; the app embeds by it.
alter table public.service_issues
  rename constraint service_issues_resolved_by_fkey to service_issues_marked_by_fkey;

alter table public.service_issues
  add column if not exists outcome text
    check (outcome in ('resolved', 'not_resolved', 'persistent')),
  add column if not exists remarks text
    check (remarks is null or length(remarks) <= 1000);

-- Anything 0117 marked done was resolved.
update public.service_issues set outcome = 'resolved' where marked_at is not null and outcome is null;

alter table public.service_issues
  add constraint service_issues_outcome_marked
    check ((outcome is null) = (marked_at is null));

drop index if exists public.service_issues_open_idx;
create index if not exists service_issues_outcome_idx
  on public.service_issues (outcome, marked_at);

/*
 * When an issue may be raised for this service: from a while before its
 * first session starts until a while after it ends. Null when the service
 * has no running order, since then there is nothing to measure from.
 */
create or replace function public.issue_window(svc uuid)
returns table (opens_at timestamptz, closes_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select min(start_time) from public.service_sessions where service_id = svc)
      - make_interval(mins => (select issue_open_minutes_before from public.app_settings)),
    public.service_ended_at(svc)
      + make_interval(mins => (select issue_close_minutes_after from public.app_settings));
$$;

revoke all on function public.issue_window(uuid) from public, anon;
grant execute on function public.issue_window(uuid) to authenticated;

-- Delete: an Admin always; whoever raised it, only until a Head has ruled.
drop policy if exists service_issues_delete on public.service_issues;
create policy service_issues_delete on public.service_issues
  for delete using (
    public.is_admin(auth.uid())
    or (raised_by = auth.uid() and outcome is null)
  );

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

drop function if exists public.resolve_issue(uuid, boolean);

/*
 * A Head's verdict on an issue for their team, with remarks. An outcome
 * of null takes the verdict back and the issue is open again.
 */
create or replace function public.mark_issue(issue uuid, outcome text, remarks text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  team uuid;
begin
  select department_id into team from public.service_issues where id = issue;
  if team is null then
    raise exception 'That issue is not there any more.';
  end if;
  if not (public.is_admin(auth.uid()) or public.is_dept_head_or_assisting(auth.uid(), team)) then
    raise exception 'Only a Head of the team it is for, or an Admin, can mark an issue.'
      using errcode = '42501';
  end if;
  if outcome is not null and outcome not in ('resolved', 'not_resolved', 'persistent') then
    raise exception 'An issue is resolved, not resolved, or persistent.';
  end if;

  update public.service_issues i
  set outcome = mark_issue.outcome,
      remarks = case when mark_issue.outcome is null then null
                     else nullif(btrim(coalesce(mark_issue.remarks, '')), '') end,
      marked_at = case when mark_issue.outcome is not null then now() end,
      marked_by = case when mark_issue.outcome is not null then auth.uid() end
  where i.id = issue;
end;
$$;

revoke all on function public.mark_issue(uuid, text, text) from public, anon;
grant execute on function public.mark_issue(uuid, text, text) to authenticated;

/* Only resolved issues expire; not resolved and persistent stay until they are. */
create or replace function public.delete_old_resolved_issues()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.service_issues
  where outcome = 'resolved'
    and marked_at + make_interval(days => (select issue_retention_days from public.app_settings)) <= now();
$$;

revoke all on function public.delete_old_resolved_issues() from public, anon;
