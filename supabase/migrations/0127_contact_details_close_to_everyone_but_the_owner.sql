/*
 * Contact details close to everyone but the Owner.
 *
 * APPLY ONLY ONCE THE APP FROM THE SAME RELEASE IS LIVE. The app before
 * it reads `profiles.email` and `select('*')` directly; this would take
 * its own profile away from everybody.
 *
 * Row security cannot hide a column, so this is done with column
 * privileges: signed-in people may select every column of `profiles`
 * except email, phone and marital_status. Their own come back through
 * my_profile(); the Owner reads everybody's through people_contacts()
 * (0126). Writing is unchanged — you still update your own phone.
 *
 * Realtime honours column privileges too (realtime.apply_rls checks
 * has_column_privilege), so a change to somebody's profile no longer
 * carries their address to every open screen.
 *
 * A NEW COLUMN ON `profiles` IS UNREADABLE until it is added to this
 * grant in a later migration. That is the point — a new personal field
 * starts closed — and the thing to remember.
 */

revoke select on public.profiles from anon, authenticated;

grant select (
  id,
  first_name,
  last_name,
  dob,
  anniversary,
  avatar_url,
  created_at,
  updated_at,
  welcomed_at,
  onboarded_at
) on public.profiles to authenticated;

notify pgrst, 'reload schema';
