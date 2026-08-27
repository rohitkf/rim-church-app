-- ============================================================================
-- Role model: Assisting Head is a deputy; Service Flow is a department
-- ============================================================================

-- 1. An Assisting Head now carries the same authority as the Department
--    Head for their own team. Rather than rewrite the fifteen policies
--    that gate on is_dept_head(), widen the function itself — every
--    policy picks the change up, and they can't drift apart later.
create or replace function public.is_dept_head(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_dept_role(
    uid, dept_id, array['department_head', 'assisting_head']::public.role_type[]
  );
$$;

-- 2. "Service Flow" is a department like any other, not a role scoped to a
--    single service, so planning a service is an Admin action. The
--    service_flow_coordinator enum value stays (dropping an enum value in
--    place is destructive) but nothing grants it any more.
drop policy services_write on public.services;
create policy services_write on public.services
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy service_sessions_write on public.service_sessions;
create policy service_sessions_write on public.service_sessions
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy department_call_times_write on public.department_call_times;
create policy department_call_times_write on public.department_call_times
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

-- 3. A head may record whether someone turned up, but must not rewrite
--    the answer that person gave. RLS is row-level, so the column-level
--    rule is enforced here instead.
create function public.availability_guard_own_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id <> auth.uid() and not public.is_admin(auth.uid()) then
    if new.status is distinct from old.status then
      raise exception 'Only the volunteer can change their own availability';
    end if;
    if new.user_id is distinct from old.user_id
       or new.service_id is distinct from old.service_id
       or new.department_id is distinct from old.department_id then
      raise exception 'An availability answer cannot be moved to another person or service';
    end if;
  end if;
  return new;
end;
$$;

create trigger availability_guard_own_answer
  before update on public.availability
  for each row execute function public.availability_guard_own_answer();
