/*
 * A team writes its own debrief, in the hours after the service.
 *
 * Until now only whoever runs the team (a Head or Assisting Head) or an
 * Admin could write a debrief. The people who were actually on the desk
 * had things to say and nowhere to say them. Now anybody on the team can
 * add to their own team's debrief, while the service is fresh: from when
 * it ends (End service if pressed, otherwise the planned end of its last
 * session, `service_ended_at`, 0115) until `debrief_open_minutes_after`
 * later — twelve hours unless App settings say otherwise.
 *
 * A member may add points, and edit or delete their own, inside that
 * window. Ticking a point done, putting it on somebody, and changing
 * anybody else's stay with the Head and the Admins, who are not held to
 * the window at all. Once a Head has ticked or assigned a member's point,
 * it is the Head's to change.
 *
 * Every policy here is added beside the ones from 0099 and 0102, not in
 * place of them. Postgres lets a row through if any permissive policy
 * does, so the Heads' and Admins' rules are untouched and this only widens
 * the door for members, inside the window.
 */

alter table public.app_settings
  add column if not exists debrief_open_minutes_after integer not null default 720
    check (debrief_open_minutes_after between 0 and 10080);

/* Whether a service's debriefs are open to its teams' members right now. */
create or replace function public.debrief_window_open(svc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    now() >= public.service_ended_at(svc)
    and now() <= public.service_ended_at(svc)
      + make_interval(mins => (select debrief_open_minutes_after from public.app_settings)),
    false
  );
$$;

revoke all on function public.debrief_window_open(uuid) from public, anon;
grant execute on function public.debrief_window_open(uuid) to authenticated;

/* Whether this person, as a member of the debrief's team, may write in it now. */
create or replace function public.member_may_write_debrief(debrief uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.service_debriefs d
    where d.id = debrief
      and public.is_dept_member(auth.uid(), d.department_id)
      and public.debrief_window_open(d.service_id)
  );
$$;

revoke all on function public.member_may_write_debrief(uuid) from public, anon;
grant execute on function public.member_may_write_debrief(uuid) to authenticated;

-- The first point a member adds starts their team's debrief, in their name.
create policy service_debriefs_insert_member on public.service_debriefs
  for insert with check (
    written_by = auth.uid()
    and public.is_dept_member(auth.uid(), department_id)
    and public.debrief_window_open(service_id)
  );

-- A point, in their own name, not yet on anybody and not ticked.
create policy service_debrief_items_insert_member on public.service_debrief_items
  for insert with check (
    created_by = auth.uid()
    and assigned_to is null
    and done_at is null
    and done_by is null
    and public.member_may_write_debrief(debrief_id)
  );

-- Their own point, while nobody has ticked or assigned it, and it stays that way.
create policy service_debrief_items_update_member on public.service_debrief_items
  for update using (
    created_by = auth.uid()
    and assigned_to is null
    and done_at is null
    and public.member_may_write_debrief(debrief_id)
  )
  with check (
    created_by = auth.uid()
    and assigned_to is null
    and done_at is null
    and done_by is null
    and public.member_may_write_debrief(debrief_id)
  );

-- Taking back their own point, while the window is open.
create policy service_debrief_items_delete_member on public.service_debrief_items
  for delete using (
    created_by = auth.uid()
    and public.member_may_write_debrief(debrief_id)
  );
