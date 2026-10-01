/*
 * Issues raised at a service.
 *
 * Something goes wrong on a Sunday — a mic that crackles, a projector
 * that will not wake, a door that sticks — and the person who notices is
 * rarely on the team that can fix it. It used to be said in passing and
 * forgotten by Tuesday. Now it is written down against the service and
 * the team it is for, with the name of whoever raised it and the team
 * they are on; the team it is for is told (bell and phone, never email);
 * and somebody on that team marks it done, with their name on that too.
 *
 * Who may raise one is the church's choice (App settings,
 * `issues_raise_scope`): anybody on a team (the default), everybody
 * signed in, or only Heads and Admins. Anybody on a team sees them all —
 * a team that keeps tripping on another's problem should see it is known.
 *
 * Resolved issues are deleted `issue_retention_days` after they were
 * marked done (30 unless changed); open ones stay until somebody acts.
 *
 * Raised and resolved only through the functions below, which decide
 * who may; so the table has no insert or update policy.
 */

alter table public.app_settings
  add column if not exists issues_raise_scope text not null default 'team'
    check (issues_raise_scope in ('everyone', 'team', 'leads')),
  add column if not exists issue_retention_days integer not null default 30
    check (issue_retention_days between 1 and 365);

create table if not exists public.service_issues (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  -- The team it is for: the one that can fix it.
  department_id uuid not null references public.departments(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  details text check (details is null or length(details) <= 2000),
  raised_by uuid references public.profiles(id) on delete set null,
  -- The team the person raising it is on, as they said — null for somebody
  -- on none (an Admin, or a Church Member where the setting allows).
  raised_by_department_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  -- Nobody can have resolved something that is not resolved. (The reverse
  -- can happen: the resolver's account is removed and their name goes.)
  check (resolved_by is null or resolved_at is not null)
);

create index if not exists service_issues_open_idx
  on public.service_issues (resolved_at nulls first, created_at desc);
create index if not exists service_issues_service_idx on public.service_issues (service_id);

alter table public.service_issues enable row level security;

/* Whether this person may raise an issue, by the church's setting. */
create or replace function public.may_raise_issue(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and case (select issues_raise_scope from public.app_settings)
    when 'everyone' then true
    when 'leads' then public.is_admin(uid) or exists (
      select 1 from public.user_roles r
      where r.user_id = uid and r.role_type in ('department_head', 'assisting_head')
    )
    else public.is_on_a_team(uid)
  end;
$$;

revoke all on function public.may_raise_issue(uuid) from public, anon;
grant execute on function public.may_raise_issue(uuid) to authenticated;

-- Read: anybody on a team, and anybody allowed to raise one.
drop policy if exists service_issues_select on public.service_issues;
create policy service_issues_select on public.service_issues
  for select using (public.is_on_a_team(auth.uid()) or public.may_raise_issue(auth.uid()));

-- Delete: an Admin, or whoever raised it.
drop policy if exists service_issues_delete on public.service_issues;
create policy service_issues_delete on public.service_issues
  for delete using (public.is_admin(auth.uid()) or raised_by = auth.uid());

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
begin
  if not public.may_raise_issue(auth.uid()) then
    raise exception 'Raising issues is not open to you — App settings say who may.'
      using errcode = '42501';
  end if;
  if title is null or length(btrim(title)) = 0 then
    raise exception 'An issue needs a line saying what is wrong.';
  end if;
  -- The team named as yours has to be one you are on.
  if as_team is not null
     and not public.is_dept_member(auth.uid(), as_team)
     and not public.is_dept_head_or_assisting(auth.uid(), as_team) then
    raise exception 'You can only raise an issue as a team you are on.' using errcode = '42501';
  end if;

  insert into public.service_issues
    (service_id, department_id, title, details, raised_by, raised_by_department_id)
  values (service, team, btrim(title), nullif(btrim(coalesce(details, '')), ''), auth.uid(), as_team)
  returning id into made;

  -- The team it is for, and whoever leads it.
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

/* Mark it done, or open it again. The team it is for, its Heads, or an Admin. */
create or replace function public.resolve_issue(issue uuid, done boolean)
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
  if not (
    public.is_admin(auth.uid())
    or public.is_dept_member(auth.uid(), team)
    or public.is_dept_head_or_assisting(auth.uid(), team)
  ) then
    raise exception 'Only the team it is for can mark it done.' using errcode = '42501';
  end if;

  update public.service_issues
  set resolved_at = case when done then now() end,
      resolved_by = case when done then auth.uid() end
  where id = issue;
end;
$$;

revoke all on function public.resolve_issue(uuid, boolean) from public, anon;
grant execute on function public.resolve_issue(uuid, boolean) to authenticated;

/* The clock: resolved issues go once they have been done for long enough. */
create or replace function public.delete_old_resolved_issues()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.service_issues
  where resolved_at is not null
    and resolved_at + make_interval(days => (select issue_retention_days from public.app_settings)) <= now();
$$;

revoke all on function public.delete_old_resolved_issues() from public, anon;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('delete-resolved-issues')
      where exists (select 1 from cron.job where jobname = 'delete-resolved-issues');
    perform cron.schedule(
      'delete-resolved-issues',
      '45 2 * * *',
      $cron$ select public.delete_old_resolved_issues(); $cron$
    );
  end if;
end $$;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_issues'
  ) then
    alter publication supabase_realtime add table public.service_issues;
  end if;
end $pub$;
