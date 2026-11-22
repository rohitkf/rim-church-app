/*
 * The export carries the rest of a person.
 *
 * The Owner, November 2026: "the EXPORT feature in registration and
 * VOLUNTEERS should be as detailed as possible. Because want the best
 * detailed data when i export it. Every single details about that
 * person or event etc".
 *
 * Nearly all of that is the app's to put on a sheet from what it can
 * already read. Three things about a person it cannot read at all:
 *
 *   marital status      closed on `profiles` with the contact details
 *                       (0127), and not in `people_contacts()`
 *   when they last      on the account (`auth.users`), which no table of
 *   signed in           the app's holds
 *   whether their       the same: an address nobody confirmed is an
 *   address is theirs   account nobody has used (0317)
 *
 * `people_details()` hands those to whoever may already read everybody's
 * contact details (`people.contacts`: the Owner's, out of the box) — the
 * same people the export gives email addresses and phone numbers to, and
 * nobody else. It is a new function rather than more columns on
 * `people_contacts()`: a wider return type there would need the function
 * dropped and made again under the app that is live.
 *
 * Read by the export only. Nothing is written.
 */

create or replace function public.people_details()
returns table (
  id uuid,
  marital_status text,
  joined_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (
    select auth.uid() as uid, public.may(auth.uid(), 'people.contacts') as sees
  )
  select p.id, p.marital_status, p.created_at, u.email_confirmed_at, u.last_sign_in_at
  from public.profiles p
  left join auth.users u on u.id = p.id, me
  where me.uid is not null and me.sees;
$function$;

revoke all on function public.people_details() from public, anon;
grant execute on function public.people_details() to authenticated;

comment on function public.people_details() is
  'Marital status, when the account was made, whether its address was confirmed and when it last signed in, for a holder of people.contacts. For the volunteer export; nothing else reads it.';
select public.migration_done(322, '0322_the_export_carries_the_rest_of_a_person', '0070e0f509d35a5b153c35949b6b642ed1783e1af51071a32beb7df8591a6361');
