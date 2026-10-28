/*
 * Who sees the clock-ins is a row in the grid.
 *
 * Since 0191 Settings › Clock in kept a list of its own — teams and
 * people, in app_settings.clock_in_viewers — of who besides Admins, the
 * Owner and Overwatch may open the Clock In page and read every
 * clock-in. A list in a room is a rule nothing else can see: the grid did
 * not know it, By person had to be taught it, and nobody could give it to
 * every Team Head at once. Now it is a capability like any other,
 * `clockin.view`, and the list's teams and people are grants of it
 * (0208).
 *
 *   Admin                     yes, always (as clock_in_admin says)
 *   Team Head, Assisting Head no, out of the box; the church may say yes
 *   Team Member               no, out of the box; the church may say yes
 *   Team Coordinator, Church Member   no — a grant names one if needed
 *
 * The Owner passes may() as always, and Overwatch still sees it unless
 * Settings › Overwatch closes it: that is Overwatch's own switch, folded
 * in a later step.
 *
 * One answer moves, on purpose. The old list let a team's Head in but not
 * its Assisting Head, against the rule that the two are alike in every
 * rule (AGENTS.md §3); a team's grant carries its roster, its Head and its
 * Assisting Heads. Checked on production before applying, old answer
 * against new for every person: nobody else's answer changed.
 *
 * app_settings.clock_in_viewers stays, read by nothing, until a later
 * release drops it; the app stops writing it with this one.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('clockin.view', 'admin', '{all}', 'all'),
  ('clockin.view', 'head', '{none,all}', 'none'),
  ('clockin.view', 'assistant', '{none,all}', 'none'),
  ('clockin.view', 'coordinator', '{none}', 'none'),
  ('clockin.view', 'member', '{none,all}', 'none'),
  ('clockin.view', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The list's teams and people, as grants: everywhere, as the list meant.
insert into public.permission_grants (capability, department_id, reach)
select 'clockin.view', d.id, 'all'
from public.app_settings s
cross join lateral jsonb_array_elements_text(coalesce(s.clock_in_viewers -> 'teams', '[]'::jsonb)) t(id)
join public.departments d on d.id::text = t.id
on conflict do nothing;

insert into public.permission_grants (capability, user_id, reach)
select 'clockin.view', p.id, 'all'
from public.app_settings s
cross join lateral jsonb_array_elements_text(coalesce(s.clock_in_viewers -> 'people', '[]'::jsonb)) t(id)
join public.profiles p on p.id::text = t.id
on conflict do nothing;

create or replace function public.may_see_clock_ins(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.clock_in_admin(uid)
    or public.overwatch_sees(uid, 'clock-in')
    or public.may(uid, 'clockin.view')
  );
$$;
