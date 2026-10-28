/*
 * The Service Planner's buttons are rows in the grid.
 *
 * Since 0184 Page by Page › Service Planner kept, in
 * app_settings.planner_controls, which teams and which people may press
 * some of the planner's buttons — "Session started", "Add time" — without
 * being able to rename, reorder or delete the plan. Like Clock in (0209)
 * and Prayer (0210), each button is now a capability and the list's
 * holders are its grants (0208):
 *
 *   planner.start  planner.hold  planner.add_time  planner.skip
 *   planner.substitute  planner.add_below  planner.remove  planner.end
 *
 * Out of the box nobody holds one — what the list said for everybody it
 * did not name. Whoever may plan the running order (svc.sessions) or run
 * the service (svc.manage) has every button as before, through those;
 * these are the buttons on their own. The church may give one to every
 * Team Head, Assisting Head, Team Coordinator or Team Member at once, or
 * to Admins; a Church Member only by a grant.
 *
 * planner_control(), which every guard and policy on the running order
 * asks, now asks may() for each button. Checked on production before
 * applying, as each person, every button: nobody's answer changed.
 *
 * planner_controls stays, read by nothing, until a later release drops it.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('planner.start', 'admin', '{none,all}', 'none'),
  ('planner.start', 'head', '{none,all}', 'none'),
  ('planner.start', 'assistant', '{none,all}', 'none'),
  ('planner.start', 'coordinator', '{none,all}', 'none'),
  ('planner.start', 'member', '{none,all}', 'none'),
  ('planner.start', 'newcomer', '{none}', 'none'),
  ('planner.hold', 'admin', '{none,all}', 'none'),
  ('planner.hold', 'head', '{none,all}', 'none'),
  ('planner.hold', 'assistant', '{none,all}', 'none'),
  ('planner.hold', 'coordinator', '{none,all}', 'none'),
  ('planner.hold', 'member', '{none,all}', 'none'),
  ('planner.hold', 'newcomer', '{none}', 'none'),
  ('planner.add_time', 'admin', '{none,all}', 'none'),
  ('planner.add_time', 'head', '{none,all}', 'none'),
  ('planner.add_time', 'assistant', '{none,all}', 'none'),
  ('planner.add_time', 'coordinator', '{none,all}', 'none'),
  ('planner.add_time', 'member', '{none,all}', 'none'),
  ('planner.add_time', 'newcomer', '{none}', 'none'),
  ('planner.skip', 'admin', '{none,all}', 'none'),
  ('planner.skip', 'head', '{none,all}', 'none'),
  ('planner.skip', 'assistant', '{none,all}', 'none'),
  ('planner.skip', 'coordinator', '{none,all}', 'none'),
  ('planner.skip', 'member', '{none,all}', 'none'),
  ('planner.skip', 'newcomer', '{none}', 'none'),
  ('planner.substitute', 'admin', '{none,all}', 'none'),
  ('planner.substitute', 'head', '{none,all}', 'none'),
  ('planner.substitute', 'assistant', '{none,all}', 'none'),
  ('planner.substitute', 'coordinator', '{none,all}', 'none'),
  ('planner.substitute', 'member', '{none,all}', 'none'),
  ('planner.substitute', 'newcomer', '{none}', 'none'),
  ('planner.add_below', 'admin', '{none,all}', 'none'),
  ('planner.add_below', 'head', '{none,all}', 'none'),
  ('planner.add_below', 'assistant', '{none,all}', 'none'),
  ('planner.add_below', 'coordinator', '{none,all}', 'none'),
  ('planner.add_below', 'member', '{none,all}', 'none'),
  ('planner.add_below', 'newcomer', '{none}', 'none'),
  ('planner.remove', 'admin', '{none,all}', 'none'),
  ('planner.remove', 'head', '{none,all}', 'none'),
  ('planner.remove', 'assistant', '{none,all}', 'none'),
  ('planner.remove', 'coordinator', '{none,all}', 'none'),
  ('planner.remove', 'member', '{none,all}', 'none'),
  ('planner.remove', 'newcomer', '{none}', 'none'),
  ('planner.end', 'admin', '{none,all}', 'none'),
  ('planner.end', 'head', '{none,all}', 'none'),
  ('planner.end', 'assistant', '{none,all}', 'none'),
  ('planner.end', 'coordinator', '{none,all}', 'none'),
  ('planner.end', 'member', '{none,all}', 'none'),
  ('planner.end', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- Each holder's buttons, as grants: everywhere, as the list meant.
insert into public.permission_grants (capability, department_id, reach)
select 'planner.' || c.control, d.id, 'all'
from public.app_settings s
cross join lateral jsonb_each(coalesce(s.planner_controls -> 'teams', '{}'::jsonb)) t(team, given)
cross join lateral jsonb_array_elements_text(case when jsonb_typeof(t.given) = 'array' then t.given else '[]'::jsonb end) c(control)
join public.departments d on d.id::text = t.team
where c.control in ('start', 'hold', 'add_time', 'skip', 'substitute', 'add_below', 'remove', 'end')
on conflict do nothing;

insert into public.permission_grants (capability, user_id, reach)
select 'planner.' || c.control, p.id, 'all'
from public.app_settings s
cross join lateral jsonb_each(coalesce(s.planner_controls -> 'people', '{}'::jsonb)) t(person, given)
cross join lateral jsonb_array_elements_text(case when jsonb_typeof(t.given) = 'array' then t.given else '[]'::jsonb end) c(control)
join public.profiles p on p.id::text = t.person
where c.control in ('start', 'hold', 'add_time', 'skip', 'substitute', 'add_below', 'remove', 'end')
on conflict do nothing;

create or replace function public.planner_control(variadic controls text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from unnest(controls) c(control)
    where public.may(auth.uid(), 'planner.' || c.control)
  );
$$;
