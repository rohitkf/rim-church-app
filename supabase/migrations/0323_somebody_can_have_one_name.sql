/*
 * Somebody can have one name.
 *
 * A last name was compulsory in four places: signing up, the joining
 * form, the profile, and `profile_gaps()`, which lists a blank one as
 * still missing and so holds the person at the form. Not everybody has
 * two names. Somebody with one had to make a second up, and the rule that
 * a name is letters (0306) refuses a dot or a dash, so what they made up
 * was a letter: one account's last name is a single character.
 *
 * The Owner asked how that could be handled (November 2026) and took the
 * recommendation: a box to tick, "I only have one name", rather than a
 * last name anybody may leave out. Ticked, it is a statement; left blank
 * is still something forgotten, and is still asked for.
 *
 *   profiles.single_name   true for somebody who has said they have one
 *                          name. Their last name is then empty, and is
 *                          not a gap.
 *
 * **Held together by a check**: with the box ticked the last name is
 * empty. Typing a last name unticks the box in the app; a write that says
 * both is refused, so the two cannot disagree.
 *
 * **Not a new form.** The joining form's number (0301) goes up when a
 * question is added, so that an app is never told of one it cannot put.
 * This takes a question away for the people it does not apply to. An app
 * from before it never ticks the box, and somebody who ticked it in the
 * new app is simply not asked for a last name by the old one.
 *
 * **Signing up carries it.** The tick is in the sign-up's metadata beside
 * the names, and `handle_new_user()` keeps it, so somebody who said so
 * when they signed up is not asked again by the form. As with the names
 * (0306), nothing there can refuse a sign-up: anything but the word
 * `true` is false.
 *
 * Readable through `my_profile()` like the rest of one's own row. It is
 * not granted on the table to everybody: other people see an empty last
 * name, which is all there is to see.
 */

alter table public.profiles
  add column if not exists single_name boolean not null default false;

comment on column public.profiles.single_name is
  'They have said they have one name only (0323): last_name is empty and is not asked for. Read through my_profile(); set by the person, on sign-up, the joining form or the profile.';

alter table public.profiles
  drop constraint if exists profiles_single_name_has_no_last_name;
alter table public.profiles
  add constraint profiles_single_name_has_no_last_name
  check (not single_name or btrim(last_name) = '');

-- ---------------------------------------------------------------------------
-- One name is not a missing last name
-- ---------------------------------------------------------------------------

create or replace function public.profile_gaps(p_user uuid, p_form integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select array_remove(array[
    case when coalesce(btrim(p.first_name), '') = '' then 'firstName' end,
    -- Somebody with one name has no last name to give (0323).
    case when coalesce(btrim(p.last_name), '') = '' and not p.single_name then 'lastName' end,
    case when coalesce(btrim(p.phone), '') = '' then 'phone' end,
    case when p.dob is null then 'dob'
         -- Form 4 (0321): a date that cannot be theirs is no answer.
         when p_form >= 4 and public.dob_problem(p.dob) is not null then 'dob' end,
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

-- ---------------------------------------------------------------------------
-- Signing up carries it
-- ---------------------------------------------------------------------------
-- As 0306 left it, with the tick: a last name sent beside it is dropped,
-- so the check above has nothing to refuse and a sign-up is never turned
-- away for a name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  one_name boolean := coalesce(new.raw_user_meta_data ->> 'single_name', '') = 'true';
begin
  insert into public.profiles (id, first_name, last_name, email, single_name)
  values (
    new.id,
    left(public.person_name_salvage(regexp_replace(coalesce(new.raw_user_meta_data ->> 'first_name', ''), '[[:cntrl:]]', '', 'g')), 80),
    case when one_name then ''
         else left(public.person_name_salvage(regexp_replace(coalesce(new.raw_user_meta_data ->> 'last_name', ''), '[[:cntrl:]]', '', 'g')), 80) end,
    new.email,
    one_name
  );
  insert into public.profile_sensitive (user_id) values (new.id);
  return new;
end;
$$;
select public.migration_done(323, '0323_somebody_can_have_one_name', 'b2325c26468ba4fb1f6d061c0ed98e8737d275c4ac01369f2a267a682cf3be4a');
