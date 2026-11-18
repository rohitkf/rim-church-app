-- Who the person to ring is to them.
--
-- 0301 asked everybody for somebody to ring in an emergency: a name and a
-- number. A name does not say who is being rung. "Ama Mensah" answers the
-- phone as a wife, a mother or a flatmate, and whoever is ringing — about
-- somebody taken ill at church — says something different to each. The
-- Owner asked for the relationship as well (November 2026).
--
-- It is one of a short list, not a sentence: the word is wanted at a
-- glance, on a phone, and a list is the same word for the same thing on
-- every profile and down one column of the export. `other` is there so
-- nobody is forced into a wrong answer. The list is lib/joining.ts's
-- `EMERGENCY_RELATIONS`; joining.test.ts reads this file and fails if the
-- two differ.
--
-- Kept and seen exactly as the name and number are (0301): a closed
-- column on `profiles`, your own through `my_profile()`, everybody's
-- through `people_contacts()` for whoever holds `people.contacts`.
--
-- **It is a new question, so it is a new form** (0301's rule): form 3. The
-- app live when this is applied has form 2 and no box for a relationship,
-- so it goes on being asked for form 2 and nobody is shut behind a
-- question their app cannot put. The three people who had answered
-- everything by then are asked this one thing more by the app that has it.

-- ---------------------------------------------------------------------------
-- The relationship
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists emergency_contact_relation text;

alter table public.profiles
  drop constraint if exists profiles_emergency_contact_relation_known,
  add constraint profiles_emergency_contact_relation_known
    check (emergency_contact_relation is null
      or emergency_contact_relation in ('spouse', 'partner', 'parent', 'child', 'sibling', 'relative', 'friend', 'other'));

comment on column public.profiles.emergency_contact_relation is
  'What the person to ring is to them: one of lib/joining.ts EMERGENCY_RELATIONS. Closed like phone (0127).';

-- ---------------------------------------------------------------------------
-- Which of the form's questions somebody has not answered, form by form
-- ---------------------------------------------------------------------------
-- Forms 1 and 2 as 0301 left them. Form 3 adds who the person to ring is.
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
    case when p_form >= 3 and coalesce(p.emergency_contact_relation, '') = '' then 'emergencyRelation' end,
    case when p_form >= 2 and coalesce(btrim(p.emergency_contact_phone), '') = '' then 'emergencyPhone' end
  ], null)
  from public.profiles p
  left join public.profile_sensitive s on s.user_id = p.id
  -- Their own home: a person is an adult in at most one household (0149).
  left join public.household_members hm on hm.user_id = p.id and hm.kind = 'adult'
  left join public.households h on h.id = hm.household_id
  where p.id = p_user;
$function$;

revoke all on function public.profile_gaps(uuid, integer) from public, anon, authenticated;

-- With no form named: the newest — Settings › Onboarding's table and the nudge.
create or replace function public.profile_gaps(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select public.profile_gaps(p_user, 3);
$function$;

revoke all on function public.profile_gaps(uuid) from public, anon, authenticated;

-- The door of the app from before the forms were numbered: form 1, as 0301
-- left it. Said again here so the newest file that defines the questions
-- says all of who is asked what.
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

-- The door of an app that says which form it has: held to the questions it
-- can put, so below 1 is form 1 and above the newest is the newest.
create or replace function public.my_profile_gaps_for(p_form integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(public.profile_gaps(auth.uid(), greatest(1, least(coalesce(p_form, 1), 3))), '{}'::text[]);
$function$;

revoke all on function public.my_profile_gaps_for(integer) from public, anon;
grant execute on function public.my_profile_gaps_for(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The contact book says who they are, too
-- ---------------------------------------------------------------------------
-- A column more is a new return type, so the function is made again; the
-- app in production reads the columns it knows and ignores the rest.
drop function if exists public.people_contacts(uuid[]);

create function public.people_contacts(p_ids uuid[] default null)
returns table (
  id uuid,
  email text,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text
)
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
    select p.id, p.email, p.phone, p.emergency_contact_name, p.emergency_contact_phone, p.emergency_contact_relation
    from public.profiles p
    where p_ids is null or p.id = any (p_ids);
end;
$function$;

revoke all on function public.people_contacts(uuid[]) from public, anon;
grant execute on function public.people_contacts(uuid[]) to authenticated;

notify pgrst, 'reload schema';
select public.migration_done(302, '0302_who_the_person_to_ring_is_to_them', '38596afa01516661f5bf0f0307e6984b69005dd01e10d382d5721786ecafffdf');
