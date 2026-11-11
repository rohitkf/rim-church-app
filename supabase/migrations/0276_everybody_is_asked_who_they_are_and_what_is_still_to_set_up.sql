-- Everybody is asked who they are — and one list of what is still to set up.
--
-- 0097 made the joining form the door for a new account, and stamped
-- everybody already here as through it: "being made to fill in a form to
-- get back into an app you have used for months is a punishment for
-- having been early". That was right then. A year on, seventeen of
-- forty-eight people have no phone number, no birthday or no status on
-- record, and they are exactly the ones nothing ever asks. The Owner has
-- decided the other way (November 2026): the joining form's rule holds
-- for everybody, and whoever has a blank is shown the form — what they
-- gave already filled in — until it is answered.
--
-- So what is missing has to be one question with one answer, asked by the
-- door (your own), by Settings › Onboarding (everybody you may send the
-- tour to) and by the nudge. `profile_gaps()` is that answer, in the
-- joining form's own field names (lib/joining.ts `missingAnswers`), so the
-- form can point at each. It never says what anybody's answer is — only
-- which questions have none.
--
-- The same room now shows the rest of getting set up in one table — the
-- tour, location on their phone, notifications, the app on the home
-- screen — and can ask whoever has something left. That ask is a bell
-- notification and, the next time they open the app, a card listing what
-- is left on that phone, which they can close. Unlike the form, it is
-- never in the way.

-- ---------------------------------------------------------------------------
-- When somebody was asked, and when they closed the card
-- ---------------------------------------------------------------------------
alter table public.onboarding
  add column if not exists setup_asked_at timestamptz,
  add column if not exists setup_asked_by uuid references public.profiles (id) on delete set null,
  add column if not exists setup_closed_at timestamptz;

comment on column public.onboarding.setup_asked_at is
  'The last time somebody asked this person to finish setting up. The card shows while this is later than setup_closed_at.';
comment on column public.onboarding.setup_closed_at is
  'When they closed the card ("Not now"), or finished what was on it.';

-- ---------------------------------------------------------------------------
-- Which of the joining form's questions somebody has not answered
-- ---------------------------------------------------------------------------
-- The statuses that do not run out are lib/joining.ts's `settled` ones;
-- joining.test.ts reads this file and fails if the two lists differ.
-- A DBS answer cannot be told from the column's default (0002: not null,
-- false), so it is never a gap. An expiry date on record answers "does it
-- have one?" by itself — profiles filled in before 0097 have the date and
-- no yes.
create or replace function public.profile_gaps(p_user uuid)
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
          and s.visa_expiry is null then 'visaExpiry' end
  ], null)
  from public.profiles p
  left join public.profile_sensitive s on s.user_id = p.id
  where p.id = p_user;
$function$;

-- Only the functions below ask it, as the owner.
revoke all on function public.profile_gaps(uuid) from public, anon, authenticated;

-- Your own, for the door.
create or replace function public.my_profile_gaps()
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(public.profile_gaps(auth.uid()), '{}'::text[]);
$function$;

revoke all on function public.my_profile_gaps() from public, anon;
grant execute on function public.my_profile_gaps() to authenticated;

-- ---------------------------------------------------------------------------
-- Whether somebody has taken the tour: lib/onboarding.ts `tourStatusOf`
-- ---------------------------------------------------------------------------
create or replace function public.tour_taken(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce((
    select seen.latest is not null and (o.pushed_at is null or seen.latest >= o.pushed_at)
    from public.onboarding o
    cross join lateral (
      select max(e.value::timestamptz) as latest from jsonb_each_text(o.seen) as e
    ) as seen
    where o.user_id = p_user
  ), false);
$function$;

revoke all on function public.tour_taken(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The table in Settings › Onboarding
-- ---------------------------------------------------------------------------
-- One row for each person the caller may send the tour to — the same
-- people whose tour and location they already read. The profile half is
-- the names of unanswered questions; `notifications` is whether any device
-- of theirs is registered for push (`push_subscriptions` is otherwise your
-- own). The tour and location columns the app reads where it always has.
create or replace function public.people_setup()
returns table (user_id uuid, joined boolean, gaps text[], notifications boolean)
language sql
stable
security definer
set search_path = public
as $function$
  select
    p.id,
    p.onboarded_at is not null,
    coalesce(public.profile_gaps(p.id), '{}'::text[]),
    exists (
      select 1 from public.push_subscriptions ps
      where ps.user_id = p.id and ps.failed_at is null
    )
  from public.profiles p
  where (select auth.uid()) is not null
    and public.may_onboard((select auth.uid()), p.id);
$function$;

revoke all on function public.people_setup() from public, anon;
grant execute on function public.people_setup() to authenticated;

-- ---------------------------------------------------------------------------
-- Whether anything at all is left for somebody
-- ---------------------------------------------------------------------------
create or replace function public.setup_outstanding(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(cardinality(public.profile_gaps(p.id)), 0) > 0
      or p.onboarded_at is null
      or not public.tour_taken(p.id)
      or coalesce(l.state, 'unknown') <> 'granted'
      or not coalesce(l.installed, false)
      or not exists (
        select 1 from public.push_subscriptions ps
        where ps.user_id = p.id and ps.failed_at is null
      )
  from public.profiles p
  left join public.location_access l on l.user_id = p.id
  where p.id = p_user;
$function$;

revoke all on function public.setup_outstanding(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Asking somebody to finish
-- ---------------------------------------------------------------------------
-- To these people, or, when p_users is null, to everybody the caller may
-- ask. Either way only those with something left are asked: a notification
-- that opens onto nothing is a nag. Returns how many were asked.
create or replace function public.prompt_setup(p_users uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  targets uuid[];
  n integer;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;

  if p_users is null then
    select coalesce(array_agg(p.id), '{}') into targets
    from public.profiles p
    where public.may_onboard(me, p.id)
      and public.setup_outstanding(p.id);
  else
    if exists (select 1 from unnest(p_users) as t where not public.may_onboard(me, t)) then
      raise exception 'Asking those people is not open to you.';
    end if;
    select coalesce(array_agg(distinct u), '{}') into targets
    from unnest(p_users) as u
    where public.setup_outstanding(u);
  end if;

  if cardinality(targets) = 0 then
    return 0;
  end if;

  insert into public.onboarding (user_id, setup_asked_at, setup_asked_by, updated_at)
  select t, now(), me, now() from unnest(targets) as t
  on conflict (user_id) do update
    set setup_asked_at = now(), setup_asked_by = excluded.setup_asked_by, updated_at = now();
  get diagnostics n = row_count;

  -- One request each in the bell: an older unread one is replaced, not stacked.
  update public.notifications
    set read_boolean = true
    where user_id = any (targets) and type = 'setup_prompt' and read_boolean = false;

  perform public.notify_people(
    targets,
    'setup_prompt',
    null,
    'A few things are still to do to finish setting up the app. Open it to see them.'
  );
  return n;
end;
$function$;

revoke all on function public.prompt_setup(uuid[]) from public, anon;
grant execute on function public.prompt_setup(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Closing the card: your own, and the bell's line with it
-- ---------------------------------------------------------------------------
create or replace function public.close_setup_prompt()
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first';
  end if;

  update public.onboarding
    set setup_closed_at = now(), updated_at = now()
    where user_id = me;

  update public.notifications
    set read_boolean = true
    where user_id = me and type = 'setup_prompt' and read_boolean = false;
end;
$function$;

revoke all on function public.close_setup_prompt() from public, anon;
grant execute on function public.close_setup_prompt() to authenticated;
