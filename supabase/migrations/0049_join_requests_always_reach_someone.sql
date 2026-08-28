-- ============================================================================
-- A join request that nobody hears is not a request
-- ============================================================================
-- request_team_join notified the team's head and assisting head, and
-- nobody else. Two ways that goes silent:
--
--   * a team with no head appointed — Stage Decor, Volunteer, and any team
--     between one head leaving and the next being named — notifies exactly
--     nobody, and the person waits on an answer that no one has been asked
--     for. This is what happened: a request sat with notified = 0.
--   * a head who has stopped using the app, with an Admin perfectly able
--     to approve it and no idea it exists.
--
-- Admins can already see and decide these requests. They were simply never
-- told, so now they are: heads first because it is their team, Admins as
-- well because somebody has to be the backstop. Distinct, so a head who is
-- also an Admin is told once, and never the person doing the asking.
-- ----------------------------------------------------------------------------

create or replace function public.request_team_join(dept_id uuid, note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if not exists (select 1 from public.departments where id = dept_id) then
    raise exception 'That team no longer exists';
  end if;
  if exists (
    select 1 from public.department_members
    where user_id = auth.uid() and department_id = dept_id
  ) then
    raise exception 'You are already on that team';
  end if;
  if exists (
    select 1 from public.team_join_requests
    where user_id = auth.uid() and department_id = dept_id and status = 'pending'
  ) then
    raise exception 'You have already asked to join that team — the head has it';
  end if;

  insert into public.team_join_requests (user_id, department_id, note)
  values (auth.uid(), dept_id, note)
  returning id into new_id;

  -- Whoever can answer it, which is the whole point.
  insert into public.notifications (user_id, type, reference_id)
  select distinct ur.user_id, 'team_join_requested', new_id
  from public.user_roles ur
  where ur.user_id <> auth.uid()
    and (
      (ur.department_id = dept_id and ur.role_type in ('department_head', 'assisting_head'))
      or ur.role_type = 'admin'
    );

  return new_id;
end;
$$;
