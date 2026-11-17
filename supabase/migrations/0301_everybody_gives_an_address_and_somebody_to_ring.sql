-- Everybody gives an address and somebody to ring.
--
-- The joining form (0097, made everybody's door by 0276) asks who somebody
-- is, how to reach them and what allows them to be here. It has never asked
-- where they live or who to ring if something happens to them at church —
-- the two things wanted in the one moment nobody can be asked. The Owner
-- has decided (November 2026) that both are asked of everybody, and that
-- nobody goes on using the app until they are answered.
--
-- **Where they live was already here.** A household has had an address
-- since 0149, on the profile under Family & home, shared by a linked
-- couple — and optional, so most are blank. Nothing is added for it: it
-- becomes a question the form asks. Line 1, the town and the postcode are
-- the answer; line 2 stays optional.
--
-- **Who to ring is new**: a name and a number on the profile. They start
-- closed, as every new column on `profiles` does (0127) — your own through
-- `my_profile()`, and everybody's only through `people_contacts()`, which
-- is whoever holds `people.contacts`: the Owner alone out of the box. A
-- Head, an Admin and the rest of the church read neither.
--
-- **The app already on people's phones must not be locked out.** That app
-- shows the joining form to anybody `my_profile_gaps()` names a blank for,
-- and its form has no box for an address: told about one, it would show a
-- form with nothing to fill in and no way past it, on every phone, until
-- the release reached it. So the questions are numbered. `my_profile_gaps()`
-- keeps asking the form as it stood (form 1) for as long as that app is
-- about, and the app that has the new boxes asks for its own form by
-- number (`my_profile_gaps_for(2)`). A later form is a later number, the
-- same way. The table in Settings › Onboarding and the nudge go by the
-- newest form at once: nobody is in the way of those.

-- ---------------------------------------------------------------------------
-- Somebody to ring
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

alter table public.profiles
  drop constraint if exists profiles_emergency_contact_name_length,
  add constraint profiles_emergency_contact_name_length
    check (emergency_contact_name is null or length(emergency_contact_name) <= 100),
  drop constraint if exists profiles_emergency_contact_phone_length,
  add constraint profiles_emergency_contact_phone_length
    check (emergency_contact_phone is null or length(emergency_contact_phone) <= 32);

comment on column public.profiles.emergency_contact_name is
  'Who to ring if something happens to this person. Closed like phone (0127): my_profile() and people_contacts() only.';
comment on column public.profiles.emergency_contact_phone is
  'That person''s number, in international form. Closed like phone (0127).';

-- ---------------------------------------------------------------------------
-- Which of the form's questions somebody has not answered, form by form
-- ---------------------------------------------------------------------------
-- Form 1 is 0276's nine questions, unchanged. Form 2 adds where they live
-- (their own household's address: line 1, town, postcode) and who to ring.
-- The names are lib/joining.ts's field names; gettingSetUp.test.ts reads
-- this file and fails if the two lists, or the settled statuses, differ.
create or replace function public.profile_gaps(p_user uuid, p_form integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select array_remove(array[
    case when coalesce(btrim(p.first_name), '') = '' then 'firstName' end,
    case when coalesce(btrim(p.last_name), '') = '' then 'lastName' end,
    case when coalesce(btrim(p.phone), '') = '' then 'phone' end,
    case when p.dob is null then 'dob' end,
    case when coalesce(p.marital_status, '') = '' then 'maritalStatus' end,
    case when p.marital_status is not distinct from 'married' and p.anniversary is null then 'anniversary' end,
    case when coalesce(s.visa_type, '') = '' then 'visaType' end,
    case when coalesce(s.visa_type, '') <> ''
          and s.visa_type not in ('british_citizen', 'irish_citizen', 'ilr', 'eu_settled')
          and s.visa_has_expiry is null
          and s.visa_expiry is null then 'visaHasExpiry' end,
    case when coalesce(s.visa_type, '') <> ''
          and s.visa_type not in ('british_citizen', 'irish_citizen', 'ilr', 'eu_settled')
          and s.visa_has_expiry is true
          and s.visa_expiry is null then 'visaExpiry' end,
    case when p_form >= 2 and coalesce(btrim(h.address_line1), '') = '' then 'addressLine1' end,
    case when p_form >= 2 and coalesce(btrim(h.town), '') = '' then 'town' end,
    case when p_form >= 2 and coalesce(btrim(h.postcode), '') = '' then 'postcode' end,
    case when p_form >= 2 and coalesce(btrim(p.emergency_contact_name), '') = '' then 'emergencyName' end,
    case when p_form >= 2 and coalesce(btrim(p.emergency_contact_phone), '') = '' then 'emergencyPhone' end
  ], null)
  from public.profiles p
  left join public.profile_sensitive s on s.user_id = p.id
  -- Their own home: a person is an adult in at most one household (0149).
  left join public.household_members hm on hm.user_id = p.id and hm.kind = 'adult'
  left join public.households h on h.id = hm.household_id
  where p.id = p_user;
$function$;

-- Only the functions below ask it, as the owner.
revoke all on function public.profile_gaps(uuid, integer) from public, anon, authenticated;

-- With no form named: the newest. This is what Settings › Onboarding's
-- table (`people_setup()`) and the nudge (`setup_outstanding()`) call, so
-- both go by form 2 from now on without being touched.
create or replace function public.profile_gaps(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select public.profile_gaps(p_user, 2);
$function$;

revoke all on function public.profile_gaps(uuid) from public, anon, authenticated;

-- The door of the app that was live when this was written: form 1, for as
-- long as that app is on anybody's phone. It can go a release or two after
-- nothing calls it.
create or replace function public.my_profile_gaps()
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(public.profile_gaps(auth.uid(), 1), '{}'::text[]);
$function$;

revoke all on function public.my_profile_gaps() from public, anon;
grant execute on function public.my_profile_gaps() to authenticated;

-- The door of an app that says which form it has. One it has never heard
-- of is not asked for: an app is held to the questions it can put, so a
-- number below 1 is form 1 and a number above the newest is the newest.
create or replace function public.my_profile_gaps_for(p_form integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(public.profile_gaps(auth.uid(), greatest(1, least(coalesce(p_form, 1), 2))), '{}'::text[]);
$function$;

revoke all on function public.my_profile_gaps_for(integer) from public, anon;
grant execute on function public.my_profile_gaps_for(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The contact book carries who to ring
-- ---------------------------------------------------------------------------
-- The same people, by the same right: whoever may read a phone number may
-- read whose number to ring instead. Two columns more is a new return
-- type, so the function is made again; the app in production reads the
-- three columns it knows and ignores the rest.
drop function if exists public.people_contacts(uuid[]);

create function public.people_contacts(p_ids uuid[] default null)
returns table (id uuid, email text, phone text, emergency_contact_name text, emergency_contact_phone text)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.may(auth.uid(), 'people.contacts') then
    raise exception 'People''s contact details are not open to you.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.phone, p.emergency_contact_name, p.emergency_contact_phone
    from public.profiles p
    where p_ids is null or p.id = any (p_ids);
end;
$function$;

revoke all on function public.people_contacts(uuid[]) from public, anon;
grant execute on function public.people_contacts(uuid[]) to authenticated;

notify pgrst, 'reload schema';
select public.migration_done(301, '0301_everybody_gives_an_address_and_somebody_to_ring', 'b362f0995f8f6fb3b079282c90ac8646605f34a3acae1738e8352071c3bcaa9e');
