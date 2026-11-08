/*
 * Who sees the Countdown is its own row in the grid (asked for by the
 * Owner, November 2026: "everyone, or certain roles, or teams, or a
 * person").
 *
 * 0261 made /countdown a page with a level — everyone, anyone on a team,
 * or Heads — written as `page.countdown`'s cells. A level only ever widens
 * from Admins and Heads down: it cannot keep the page from an Admin, nor
 * open it to the Media team alone. So the page now opens by a capability
 * of its own, `countdown.view` ("See the Countdown"), as Reception opens by
 * `reg.door` (0247):
 *
 *   - every role's cell is a choice — Admin, Team Head, Assisting Head,
 *     Team Coordinator, Team Member and Church Member, each yes or no;
 *   - a team (or only its Heads) or one person is a grant (0208), made in
 *     Access & Privileges › By team / By person, and may end on a date;
 *   - the Owner always sees it, as with every cell.
 *
 * The defaults are what 0261 gave out of the box. The church's own choice
 * since then — in production the Team Member cell turned off — is carried
 * across cell for cell, and any grant with it; page.countdown goes in 0265.
 * The page hides itself only: the services and their sessions it reads
 * are the Service Planner's, and this changes nobody's reading of them.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('countdown.view', 'admin', '{none,all}', 'all'),
  ('countdown.view', 'head', '{none,all}', 'all'),
  ('countdown.view', 'assistant', '{none,all}', 'all'),
  ('countdown.view', 'coordinator', '{none,all}', 'none'),
  ('countdown.view', 'member', '{none,all}', 'all'),
  ('countdown.view', 'newcomer', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The church's choices so far, carried over.
insert into public.role_permissions (role_key, capability, reach, updated_by, updated_at)
select role_key, 'countdown.view', reach, updated_by, updated_at
from public.role_permissions
where capability = 'page.countdown'
on conflict (role_key, capability) do update set reach = excluded.reach;

insert into public.permission_grants (capability, user_id, department_id, reach, granted_by, leads_only, expires_at)
select 'countdown.view', g.user_id, g.department_id, g.reach, g.granted_by, g.leads_only, g.expires_at
from public.permission_grants g
where g.capability = 'page.countdown';

-- The old row goes in 0265, once the app that reads this one is live:
-- the release before it still asks page.countdown.

notify pgrst, 'reload schema';
