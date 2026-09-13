/*
 * Somebody who signs up is asked who they are, once.
 *
 * Signing up took an email and a password, and left a profile with two
 * names in it. Everything else — a phone number, a birthday, whether
 * there is an anniversary to celebrate, what allows them to work in this
 * country, whether they hold a DBS check — sat empty on a Settings page
 * nobody visits twice, so the church's own records were whatever people
 * had got round to typing. A rota built on that is guesswork, and the
 * compliance half of it is not guesswork anybody should be doing.
 *
 * So there is an onboarding, and it is not skippable: until it is done
 * the app is one form. Three columns are needed to run it.
 *
 * `onboarded_at` — like `welcomed_at` before it, everybody already here is
 * stamped as done. Being made to fill in a form to get back into an app
 * you have used for months is a punishment for having been early.
 */

alter table public.profiles
  add column if not exists marital_status text,
  add column if not exists onboarded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_marital_status_is_known'
  ) then
    alter table public.profiles
      add constraint profiles_marital_status_is_known
      check (
        marital_status is null
        or marital_status in ('single', 'married', 'widowed', 'divorced')
      );
  end if;
end $$;

comment on column public.profiles.marital_status is
  'Single, married, widowed or divorced. Married is what makes an anniversary worth asking for.';
comment on column public.profiles.onboarded_at is
  'When they finished the joining form. Null means they have not, and the app is that form until they do.';

/*
 * Whether their visa runs out, which is not the same question as when.
 *
 * A visa with no end date and a visa whose date nobody has entered are
 * both a null `visa_expiry`, and an Admin looking at a list of people
 * whose right to work needs checking cannot tell those apart. So the
 * answer to "does it have an expiry?" is kept as its own yes or no, and
 * null keeps its honest meaning: nobody has been asked.
 */
alter table public.profile_sensitive
  add column if not exists visa_has_expiry boolean;

comment on column public.profile_sensitive.visa_has_expiry is
  'Yes, no, or null for never asked. Not asked at all of a citizen or somebody settled here.';

-- Everybody already using the app has been through the door already.
update public.profiles set onboarded_at = now() where onboarded_at is null;
