/*
 * A team says it is ready.
 *
 * Checklists say how far each job has got; they do not say the thing the
 * person at the front wants to know five minutes before the start — is
 * every team ready to go? So each team serving a service has a light:
 * red until somebody who runs the team on the day turns it green, and
 * back to red if they change their mind.
 *
 * Who may turn it: an Admin, the team's Head or Assisting Head (the same
 * in every rule), or whoever the rota puts in Team Coordinator for that
 * team at that service. Nobody else — a light anybody could flip would
 * say nothing.
 *
 * No row is red. A row remembers who last set it and when, so the page
 * can say "Ready · Santhi, 9:42". Once the service has finished the
 * lights are a record and stop moving, like everything else about it.
 *
 * Written only through set_team_ready, so the table has no write policy:
 * the function is the one way in, and it decides who may.
 */

create table if not exists public.service_team_readiness (
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  ready boolean not null default false,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (service_id, department_id)
);

alter table public.service_team_readiness enable row level security;

-- Read as the rota is: by anybody on a team.
drop policy if exists service_team_readiness_select on public.service_team_readiness;
create policy service_team_readiness_select on public.service_team_readiness
  for select using (public.is_on_a_team(auth.uid()));

/* Whether this person may turn this team's light at this service. */
create or replace function public.may_mark_team_ready(uid uuid, svc uuid, dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or public.is_dept_head(uid, dept)
    or exists (
      select 1 from public.rota_assignments a
      where a.service_id = svc
        and a.department_id = dept
        and a.user_id = uid
        and lower(btrim(a.role_label)) in ('coordinator', 'team coordinator')
    )
  );
$$;

revoke all on function public.may_mark_team_ready(uuid, uuid, uuid) from public, anon;
grant execute on function public.may_mark_team_ready(uuid, uuid, uuid) to authenticated;

create or replace function public.set_team_ready(service uuid, department uuid, is_ready boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.may_mark_team_ready(auth.uid(), service, department) then
    raise exception 'Only the team’s Coordinator, its Head or an Admin can say whether it is ready.'
      using errcode = '42501';
  end if;
  if public.service_has_finished(service) then
    raise exception 'That service has finished — its lights are a record now.'
      using errcode = 'P0001';
  end if;

  insert into public.service_team_readiness (service_id, department_id, ready, marked_by, marked_at)
  values (service, department, is_ready, auth.uid(), now())
  on conflict (service_id, department_id) do update
    set ready = excluded.ready,
        marked_by = excluded.marked_by,
        marked_at = excluded.marked_at;
end;
$$;

revoke all on function public.set_team_ready(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_team_ready(uuid, uuid, boolean) to authenticated;

-- Live: the dashboard's lights change the moment a team turns green.
do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'service_team_readiness'
  ) then
    alter publication supabase_realtime add table public.service_team_readiness;
  end if;
end $pub$;
