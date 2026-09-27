/*
 * A role can be for before the service, after it, or both.
 *
 * Every role's checklist has two halves (0062): what is done before the
 * doors open and what is done once the service is over. Somebody covering
 * only the setting-up one Sunday owed the packing-up list anyway, and it
 * sat on their page unticked, holding the team's readiness down and
 * drawing a reminder for work nobody had asked them to do.
 *
 * So an assignment says which halves it carries. Both, as before, unless
 * the Head untick one — but never neither: an assignment with no checklist
 * at all is a different thing (a role with no items), not this.
 *
 * assign_to_rota gains the two choices, defaulting to both, so the app
 * already live keeps working unchanged; the reminder skips the half an
 * assignment does not carry.
 */

alter table public.rota_assignments
  add column if not exists include_pre boolean not null default true,
  add column if not exists include_post boolean not null default true;

alter table public.rota_assignments
  drop constraint if exists rota_assignments_carries_a_half;
alter table public.rota_assignments
  add constraint rota_assignments_carries_a_half check (include_pre or include_post);

-- Whether this assignment carries this half of its role's checklist.
create or replace function public.assignment_carries_phase(pre boolean, post boolean, phase text)
returns boolean
language sql
immutable
as $$
  select (phase = 'pre' and pre) or (phase = 'post' and post);
$$;

create or replace function public.awaiting_checklist(svc_id uuid, dept_id uuid default null)
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select distinct a.user_id
  from public.rota_assignments a
  join public.department_role_checklist_items i on i.role_id = a.role_id
  left join public.rota_checklist_progress p
    on p.assignment_id = a.id and p.item_id = i.id
  where a.service_id = svc_id
    and (dept_id is null or a.department_id = dept_id)
    and public.assignment_carries_phase(a.include_pre, a.include_post, i.phase)
    and coalesce(p.status, 'pending') = 'pending';
$function$;

-- The old six-argument form goes, so there is one assign_to_rota for the
-- API to resolve; the new one answers the same named call the live app
-- makes, since the two new choices default to both.
drop function if exists public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[]);

create or replace function public.assign_to_rota(
  service uuid,
  department uuid,
  person uuid,
  role_label text,
  role uuid default null,
  tags uuid[] default '{}',
  before_service boolean default true,
  after_service boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  made uuid;
begin
  insert into public.rota_assignments
    (service_id, department_id, user_id, role_label, role_id, include_pre, include_post)
  values (service, department, person, role_label, role, before_service, after_service)
  returning id into made;

  insert into public.rota_assignment_tags (assignment_id, tag_id)
  select made, t from unnest(coalesce(tags, '{}')) as t
  on conflict do nothing;

  return made;
end;
$$;

revoke all on function public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[], boolean, boolean) from public, anon;
grant execute on function public.assign_to_rota(uuid, uuid, uuid, text, uuid, uuid[], boolean, boolean) to authenticated;
