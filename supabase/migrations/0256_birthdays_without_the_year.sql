/*
 * Birthdays without the year — everybody's age is the Owner's and the
 * Admins' to know (November 2026).
 *
 * `profiles.dob` is readable by every signed-in person (0127 kept it
 * open, for the Celebrations card), so although the screens stopped
 * showing other people's ages, anybody who knew how could still read
 * anybody's date of birth. This is the way the app reads them instead:
 *
 *   birth_dates(p_ids)  one row per person with a date of birth —
 *     dob       the whole date: your own, or anybody's for the Owner and
 *               Admins (is_admin, which counts the Owner); null otherwise
 *     birthday  'MM-DD', for everybody: the dashboard and the diary still
 *               mark the day, which needs nothing more
 *
 * p_ids narrows it to some people; null is everybody.
 *
 * Additive, and safe to apply before the app that uses it. 0257 then
 * takes `dob` off what signed-in people may select from `profiles` —
 * and that one waits for this release to be live.
 */

create or replace function public.birth_dates(p_ids uuid[] default null)
returns table (id uuid, dob date, birthday text)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    case when p.id = auth.uid() or public.is_admin(auth.uid()) then p.dob end,
    to_char(p.dob, 'MM-DD')
  from public.profiles p
  where auth.uid() is not null
    and p.dob is not null
    and (p_ids is null or p.id = any (p_ids));
$$;

revoke all on function public.birth_dates(uuid[]) from public, anon;
grant execute on function public.birth_dates(uuid[]) to authenticated;

notify pgrst, 'reload schema';
