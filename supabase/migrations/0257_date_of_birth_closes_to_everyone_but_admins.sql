/*
 * Date of birth closes to everyone but the Owner and Admins.
 *
 * APPLY ONLY ONCE THE APP FROM THE 0256 RELEASE IS LIVE. The app before it
 * reads `profiles.dob` directly — the Celebrations card, the diary, the
 * team page, Volunteers, the family card — and with this applied every
 * one of those reads fails outright ("permission denied for column dob"),
 * not just the date.
 *
 * Column privileges, as 0127 did for email and phone: signed-in people
 * keep every other column they had. Their own date comes back through
 * my_profile(); the day and month of everybody's, and the whole date for
 * the Owner and Admins, through birth_dates() (0256). Writing is
 * unchanged — you still set your own.
 */

revoke select (dob) on public.profiles from anon, authenticated;

notify pgrst, 'reload schema';
