/*
 * Who may ask to join a team is the church's to say.
 *
 * 0189 tied asking to join to seeing the Teams page: whoever the page was
 * closed to could not ask. That made one switch do two jobs. A church may
 * want Church Members to see how it is organised without being able to
 * ask their way in, or the reverse, and it may want to stop people already
 * on a team asking to join others.
 *
 * So asking is a row of its own in the permission grid (Settings › Access
 * & privileges), and request_team_join asks it. Who sees the Teams page
 * stays where it was, in Settings › Page by page.
 *
 *   Church Member   no, out of the box — a head adds them (as 0189)
 *   Team Member     yes, to any team
 *   Head, Assisting Head   yes
 *   Coordinator     — (a coordinator is a Team Member, and asks as one)
 *   Admin           — (an Admin adds themselves)
 *
 * Overwatch is still refused: it reads every team already.
 *
 * Nothing changes for anybody on applying this: today a Church Member
 * cannot ask and everybody on a team can, which is what the defaults say.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('team.request_join', 'admin', '{none}', 'none'),
  ('team.request_join', 'head', '{none,all}', 'all'),
  ('team.request_join', 'assistant', '{none,all}', 'all'),
  ('team.request_join', 'coordinator', '{none}', 'none'),
  ('team.request_join', 'member', '{none,all}', 'all'),
  ('team.request_join', 'newcomer', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

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
  -- Who may ask is the church's to say, role by role (team.request_join,
  -- Settings › Access & privileges). Out of the box a Church Member may
  -- not: a team head adds them instead (0189, 0190).
  if not public.may(auth.uid(), 'team.request_join') then
    raise exception 'A team head adds people to their team — ask them to add you';
  end if;
  -- Overwatch reads every team already; it is not on one by asking.
  if public.is_overwatch(auth.uid()) and not public.is_admin(auth.uid()) then
    raise exception 'Overwatch already sees every team — a team head can add you if you are to serve on one';
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
  if exists (
    select 1 from public.team_join_requests
    where user_id = auth.uid() and department_id = dept_id
      and status in ('withdrawn', 'declined')
      and coalesce(responded_at, created_at) > now() - interval '1 day'
  ) then
    raise exception 'You asked to join that team today — ask again tomorrow';
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


revoke all on function public.request_team_join(uuid, text) from public, anon;
grant execute on function public.request_team_join(uuid, text) to authenticated;

notify pgrst, 'reload schema';
