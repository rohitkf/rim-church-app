-- ============================================================================
-- Reordering by hand: roles, their checklists, and a running order
-- ============================================================================
-- Three lists people build are shown in an order nobody chose. Roles came
-- back alphabetically, so "Camera Operator 1, 2, 3" was luck rather than
-- intent and "Director" sorted between them. A checklist's items came back
-- in the order they were typed. A running order could only be reordered by
-- deleting a session and adding it again in the right place.
--
-- All three now have a hand-set order, and one function each to write it.
-- The functions are SECURITY INVOKER, so the same RLS that governs an
-- ordinary update governs a reorder: an Admin or the team's Head for the
-- first two, an Admin on an unfinished service for the third. Each raises
-- rather than silently doing nothing when a write is refused, so a caller
-- without the grant sees an error instead of a list that springs back.

-- ----------------------------------------------------------------------------
-- Roles get an order of their own, seeded with the alphabetical one they
-- already had so nothing moves the day this ships.
-- ----------------------------------------------------------------------------
alter table public.department_roles
  add column if not exists sort_order integer not null default 0;

update public.department_roles r
set sort_order = seeded.rn
from (
  select id, (row_number() over (partition by department_id order by name)) - 1 as rn
  from public.department_roles
) as seeded
where seeded.id = r.id and r.sort_order = 0;

-- ----------------------------------------------------------------------------
-- `ids` is the whole list in its new order. Passing a partial list would
-- leave the rest holding stale positions, so it is refused.
-- ----------------------------------------------------------------------------
create or replace function public.reorder_department_roles(dept uuid, ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  i int;
begin
  if coalesce(array_length(ids, 1), 0) <> (
    select count(*) from public.department_roles where department_id = dept
  ) then
    raise exception 'a reorder needs every role of the team, once each';
  end if;
  if coalesce(array_length(ids, 1), 0) = 0 then
    return;
  end if;

  for i in 1..array_length(ids, 1) loop
    update public.department_roles
       set sort_order = i
     where id = ids[i] and department_id = dept;
    if not found then
      raise exception 'cannot reorder these roles';
    end if;
  end loop;
end;
$$;

create or replace function public.reorder_role_checklist_items(role uuid, ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  i int;
begin
  if coalesce(array_length(ids, 1), 0) <> (
    select count(*) from public.department_role_checklist_items where role_id = role
  ) then
    raise exception 'a reorder needs every item of the checklist, once each';
  end if;
  if coalesce(array_length(ids, 1), 0) = 0 then
    return;
  end if;

  for i in 1..array_length(ids, 1) loop
    update public.department_role_checklist_items
       set sort_order = i
     where id = ids[i] and role_id = role;
    if not found then
      raise exception 'cannot reorder this checklist';
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- A running order is not just a list: every session after the first starts
-- when the one before it ends, so moving a session moves every clock under
-- it. The cascade is redone here from the service's own first start, which
-- is the one time a planner actually sets.
--
-- Two phases, because (service_id, order_index) is unique and not
-- deferrable: writing 1..N straight over 1..N collides on the way through.
-- Negating first parks every row somewhere no new number will land.
-- ----------------------------------------------------------------------------
create or replace function public.reorder_service_sessions(svc uuid, ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  i int;
  cursor_time timestamptz;
  dur int;
begin
  if coalesce(array_length(ids, 1), 0) <> (
    select count(*) from public.service_sessions where service_id = svc
  ) then
    raise exception 'a reorder needs every session of the service, once each';
  end if;
  if coalesce(array_length(ids, 1), 0) = 0 then
    return;
  end if;

  select min(start_time) into cursor_time
  from public.service_sessions where service_id = svc;

  update public.service_sessions
     set order_index = -order_index
   where service_id = svc;
  if not found then
    raise exception 'cannot reorder this running order';
  end if;

  for i in 1..array_length(ids, 1) loop
    update public.service_sessions
       set order_index = i, start_time = cursor_time
     where id = ids[i] and service_id = svc
    returning duration_minutes into dur;
    if not found then
      raise exception 'cannot reorder this running order';
    end if;
    cursor_time := cursor_time + make_interval(mins => coalesce(dur, 0));
  end loop;
end;
$$;

grant execute on function public.reorder_department_roles(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_role_checklist_items(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_service_sessions(uuid, uuid[]) to authenticated;
