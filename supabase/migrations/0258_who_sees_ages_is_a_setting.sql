/*
 * Who sees how old people are is the church's to say (asked for by the
 * Owner, November 2026).
 *
 * 0256 decided it in code: the whole date of birth for your own, and for
 * the Owner and Admins. Now it is a row in Settings › Access & Privileges,
 * "See how old people are" (people.ages), so it can be changed without a
 * release:
 *
 *   Admin                 Yes by default; can be turned off
 *   Head, Assisting Head  No by default; can be turned on
 *   Team Member           No by default; can be turned on
 *   Coordinator, Church   No, fixed
 *
 * The Owner always may, as with every cell (may()). A person or a team can
 * be given it by name too (permission_grants, By person / By team), and a
 * grant may end on a date.
 *
 * birth_dates() asks may() instead of is_admin(): the whole date for your
 * own, and for whoever the grid says; the day and month for everybody
 * else. Everybody keeps their own date and everybody's birthday.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('people.ages', 'admin', '{none,all}', 'all'),
  ('people.ages', 'head', '{none,all}', 'none'),
  ('people.ages', 'assistant', '{none,all}', 'none'),
  ('people.ages', 'coordinator', '{none}', 'none'),
  ('people.ages', 'member', '{none,all}', 'none'),
  ('people.ages', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

create or replace function public.birth_dates(p_ids uuid[] default null)
returns table (id uuid, dob date, birthday text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid, public.may(auth.uid(), 'people.ages') as sees
  )
  select
    p.id,
    case when p.id = me.uid or me.sees then p.dob end,
    to_char(p.dob, 'MM-DD')
  from public.profiles p, me
  where me.uid is not null
    and p.dob is not null
    and (p_ids is null or p.id = any (p_ids));
$$;

revoke all on function public.birth_dates(uuid[]) from public, anon;
grant execute on function public.birth_dates(uuid[]) to authenticated;

notify pgrst, 'reload schema';
