/*
 * A date of birth has to be somebody's.
 *
 * The joining form asks everybody their date of birth and took whatever
 * the picker was left on. The picker opens on today, so an account could
 * say its owner was born this morning, and one does. The Owner, November
 * 2026: "I hope there's validation for people who's age is 0. Because i
 * saw some people do something like that. [...] For anyone who's age is 0
 * or something like that, they have to strictly fill it in next time in
 * order to use the app."
 *
 * **What counts.** Somebody with an account is between 5 and 110 years
 * old. The youngest people here are teenagers; five leaves room for a
 * child who really has an account and still refuses every date that is
 * only where the picker happened to be. `dob_problem()` is the one
 * definition, and says what is wrong in words. It is about an account's
 * own date only: a child written into a household (0149) can be a baby.
 *
 * **Refused when it is written.** A trigger on `profiles` refuses a date
 * that changes to one that cannot be right, from any app, old or new. A
 * date already there is not touched by saving something else.
 *
 * **And asked for again.** The joining form's questions are numbered
 * (0301): this is form 4, whose date of birth has to be a real one. For
 * an app that puts form 4, `profile_gaps()` lists `dob` for a date that
 * cannot be right just as it does for none, and the door (ProtectedRoute)
 * sends the person to the form until it is corrected. The app that is
 * live while this is applied puts form 3 and is told nothing new, which
 * matters: told, it would show a form with a date filled in and no word
 * about what was wrong with it.
 *
 * Everybody who had finished form 3 and has a real date has finished
 * form 4, on the day they finished 3 (0304: a new form is a new row).
 *
 * **Under 18.** The Owner also asked for a label beside the name of
 * anybody under 18 on the team page and Volunteers. Dates of birth are
 * closed (0257), so the pages ask one thing: who is under 18.
 *
 *   people.minors   see who is under 18. Admins, Heads and Assisting
 *                    Heads out of the box, the Owner always; a choice in
 *                    every cell. Not everybody: anybody can sign up, and
 *                    a list of which accounts are children is not for
 *                    whoever signed up this morning.
 *
 * `people_under_18()` answers with ids and nothing else: no date, no
 * age. Somebody whose date cannot be right is not listed as under 18 on
 * the strength of it.
 */

-- ---------------------------------------------------------------------------
-- What a date of birth has to be
-- ---------------------------------------------------------------------------

create or replace function public.account_min_age()
returns integer
language sql
immutable
set search_path = ''
as $function$
  select 5;
$function$;

create or replace function public.account_max_age()
returns integer
language sql
immutable
set search_path = ''
as $function$
  select 110;
$function$;

/* What is wrong with a date of birth for somebody with an account, in words; null when nothing is. */
create or replace function public.dob_problem(p_dob date)
returns text
language sql
stable
set search_path = ''
as $function$
  select case
    when p_dob is null then null
    when p_dob > current_date then 'A date of birth cannot be in the future.'
    when p_dob > (current_date - make_interval(years => public.account_min_age()))::date
      then format('That date of birth would make you under %s. Enter your own date of birth.', public.account_min_age())
    when p_dob < (current_date - make_interval(years => public.account_max_age()))::date
      then format('That date of birth is more than %s years ago. Check the year.', public.account_max_age())
  end;
$function$;

revoke all on function public.account_min_age() from public, anon;
revoke all on function public.account_max_age() from public, anon;
revoke all on function public.dob_problem(date) from public, anon;
grant execute on function public.account_min_age() to authenticated;
grant execute on function public.account_max_age() to authenticated;
grant execute on function public.dob_problem(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Refused when it is written
-- ---------------------------------------------------------------------------

create or replace function public.profiles_dob_is_somebodys()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  problem text;
begin
  if new.dob is null then
    return new;
  end if;
  -- A date already there is not this save's doing.
  if tg_op = 'UPDATE' and new.dob is not distinct from old.dob then
    return new;
  end if;
  problem := public.dob_problem(new.dob);
  if problem is not null then
    raise exception '%', problem;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_dob_is_somebodys on public.profiles;
create trigger profiles_dob_is_somebodys
  before insert or update of dob on public.profiles
  for each row execute function public.profiles_dob_is_somebodys();

-- ---------------------------------------------------------------------------
-- Form 4: the date of birth has to be a real one
-- ---------------------------------------------------------------------------

create or replace function public.joining_form()
returns integer
language sql
immutable
set search_path = ''
as $function$
  select 4;
$function$;

revoke all on function public.joining_form() from public, anon, authenticated;

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

-- Finished form 3 with a date that is somebody's: finished form 4, then.
insert into public.profile_completions (user_id, form, completed_at)
select c.user_id, 4, c.completed_at
from public.profile_completions c
join public.profiles p on p.id = c.user_id
where c.form = 3
  and p.onboarded_at is not null
  and cardinality(public.profile_gaps(c.user_id, 4)) = 0
on conflict (user_id, form) do nothing;

-- ---------------------------------------------------------------------------
-- Who is under 18
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('people.minors', 'admin', '{none,all}', 'all'),
  ('people.minors', 'head', '{none,all}', 'all'),
  ('people.minors', 'assistant', '{none,all}', 'all'),
  ('people.minors', 'coordinator', '{none,all}', 'none'),
  ('people.minors', 'member', '{none,all}', 'none'),
  ('people.minors', 'newcomer', '{none,all}', 'none'),
  ('people.minors', 'overwatch', '{none,all}', 'none'),
  ('people.minors', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

create or replace function public.people_under_18(p_ids uuid[] default null)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (
    select auth.uid() as uid, public.may(auth.uid(), 'people.minors') as sees
  )
  select p.id
  from public.profiles p, me
  where me.uid is not null
    and me.sees
    and p.dob is not null
    -- A date that cannot be theirs says nothing about how old they are.
    and public.dob_problem(p.dob) is null
    and p.dob > (current_date - interval '18 years')::date
    and (p_ids is null or p.id = any (p_ids));
$function$;

revoke all on function public.people_under_18(uuid[]) from public, anon;
grant execute on function public.people_under_18(uuid[]) to authenticated;

comment on function public.dob_problem(date) is
  'What is wrong with a date of birth for somebody with an account (between account_min_age() and account_max_age() years old), in words; null when nothing is. The one definition: the trigger on profiles, profile_gaps() and people_under_18() ask it, and lib/ownAge.ts holds the same numbers.';
comment on function public.people_under_18(uuid[]) is
  'The ids of the accounts under 18, for a holder of people.minors. Ids only: no date, no age.';
select public.migration_done(321, '0321_a_date_of_birth_has_to_be_somebodys', 'dd9912537ca058c911dd7cbb46f0e2476510e715066b72683c3273895112338e');
