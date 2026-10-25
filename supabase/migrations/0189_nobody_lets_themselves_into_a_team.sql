/*
 * Nobody lets themselves into a team.
 *
 * Somebody who signs up is a Church Member until a team has them. They
 * could open the Teams page and press Request to join on any team, and a
 * head approving it in a hurry let them into that team's rota, chat,
 * checklists and the pages that come with being on a team. The church
 * would rather its heads add people themselves, from the team's own page.
 *
 * So the Teams page is for people on a team, out of the box: a Church
 * Member is not shown it, and the database refuses a request to join from
 * anybody the page is closed to — not merely a button that is not drawn.
 * Somebody already on a team can still ask to join another, as before.
 * A church that wants the old way opens Teams to everyone signed in again
 * in Settings › Page by page, and asking comes back with it.
 *
 * Overwatch, which reads every team already (0187), is refused too.
 *
 * Requests already waiting are untouched: a head can still answer them.
 */

create or replace function public.page_level(page text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.page_access ->> page from public.app_settings s limit 1),
    case page
      when 'service-planner' then 'everyone'
      when 'set-lists'       then 'everyone'
      when 'updates'         then 'everyone'
      when 'polls'           then 'everyone'
      when 'events'          then 'everyone'
      when 'giving'          then 'everyone'
      when 'stage'           then 'everyone'
      -- Teams, from here on, is for people on a team.
      else 'team'
    end
  );
$$;

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
  -- Asking is done from the Teams page, so whoever that page is closed to
  -- cannot ask: a Church Member, out of the box, is added by a head
  -- rather than letting themselves in (0189).
  if not public.can_open_page(auth.uid(), 'departments') then
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
