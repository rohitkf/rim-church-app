/*
 * Prayer's three lists are rows in the grid.
 *
 * Settings › Prayer kept three lists of its own (0197, 0198) — teams and
 * people in app_settings.prayer_carers, prayer_assigners and
 * prayer_list_runners — of who besides the Pastors and the Owner may read
 * private requests, ask people to pray for one, and run prayer lists. As
 * with Clock in (0209), each is now a capability, and the lists' teams and
 * people are grants of it (0208):
 *
 *   prayer.pastoral   read private requests, and who prays for each
 *   prayer.assign     ask people to pray for a request
 *   prayer.lists      run prayer lists
 *
 * Out of the box nobody but a Pastor and the Owner holds any of them —
 * what the empty lists said. Admins included: a private request is for
 * the pastors, so an Admin is not one by being an Admin, but the church
 * may say otherwise. A Team Coordinator and a Church Member are given one
 * only by a grant.
 *
 * The Pastor role and the Owner stay pastoral whatever the grid says;
 * pastoral still carries assigning and running lists, as before.
 *
 * Checked on production before applying, old answer against new for every
 * person and all three: nobody's changed.
 *
 * The three columns stay, read by nothing, until a later release drops them.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('prayer.pastoral', 'admin', '{none,all}', 'none'),
  ('prayer.pastoral', 'head', '{none,all}', 'none'),
  ('prayer.pastoral', 'assistant', '{none,all}', 'none'),
  ('prayer.pastoral', 'coordinator', '{none}', 'none'),
  ('prayer.pastoral', 'member', '{none,all}', 'none'),
  ('prayer.pastoral', 'newcomer', '{none}', 'none'),
  ('prayer.assign', 'admin', '{none,all}', 'none'),
  ('prayer.assign', 'head', '{none,all}', 'none'),
  ('prayer.assign', 'assistant', '{none,all}', 'none'),
  ('prayer.assign', 'coordinator', '{none}', 'none'),
  ('prayer.assign', 'member', '{none,all}', 'none'),
  ('prayer.assign', 'newcomer', '{none}', 'none'),
  ('prayer.lists', 'admin', '{none,all}', 'none'),
  ('prayer.lists', 'head', '{none,all}', 'none'),
  ('prayer.lists', 'assistant', '{none,all}', 'none'),
  ('prayer.lists', 'coordinator', '{none}', 'none'),
  ('prayer.lists', 'member', '{none,all}', 'none'),
  ('prayer.lists', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- Each list's teams and people, as grants: everywhere, as the lists meant.
insert into public.permission_grants (capability, department_id, reach)
select l.cap, d.id, 'all'
from public.app_settings s
cross join lateral (values
  ('prayer.pastoral', s.prayer_carers),
  ('prayer.assign', s.prayer_assigners),
  ('prayer.lists', s.prayer_list_runners)
) l(cap, audience)
cross join lateral jsonb_array_elements_text(coalesce(l.audience -> 'teams', '[]'::jsonb)) t(id)
join public.departments d on d.id::text = t.id
on conflict do nothing;

insert into public.permission_grants (capability, user_id, reach)
select l.cap, p.id, 'all'
from public.app_settings s
cross join lateral (values
  ('prayer.pastoral', s.prayer_carers),
  ('prayer.assign', s.prayer_assigners),
  ('prayer.lists', s.prayer_list_runners)
) l(cap, audience)
cross join lateral jsonb_array_elements_text(coalesce(l.audience -> 'people', '[]'::jsonb)) t(id)
join public.profiles p on p.id::text = t.id
on conflict do nothing;

create or replace function public.prayer_pastoral(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_pastor(uid)
    or exists (select 1 from public.app_owner o where o.user_id = uid)
    or public.may(uid, 'prayer.pastoral')
  );
$$;

create or replace function public.prayer_may_assign(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.prayer_pastoral(uid) or public.may(uid, 'prayer.assign');
$$;

create or replace function public.prayer_may_run_lists(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.prayer_pastoral(uid) or public.may(uid, 'prayer.lists');
$$;
