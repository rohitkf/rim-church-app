-- When somebody finished their details.
--
-- Settings › Onboarding says who has answered everything the joining form
-- asks, as a tick. It could not say when. The Owner asked for the date
-- (November 2026): everybody was sent back to the form twice in two days,
-- and "who has done it" is a different question from "who did it on the
-- day they were asked".
--
-- **A date for each form.** The form's questions are numbered (0301), and
-- finishing form 2 is not finishing form 3. So what is kept is one row for
-- a person and a form: the first moment every question of that form had an
-- answer. It is written once and never moved — rubbing an answer out later
-- makes the profile incomplete again (the tick goes) but does not unsay
-- that it was finished, and finishing it a second time is not a second
-- date. A new form is a new row.
--
-- **Written by the database, wherever the last answer comes from.** An
-- answer can land in four places: the profile, the status and DBS half, the
-- household's address, and a household somebody is linked into. A trigger
-- on each asks the one question — is every question of the newest form
-- answered for this person? — and records the moment the answer is first
-- yes. No app has to remember to say so, and an app that does not know
-- about this (the one live now) is recorded all the same.
--
-- **It never stands in the way of a save.** If recording the date fails,
-- the save it was watching still goes through: a missing date is a smaller
-- thing than somebody shut out of their own profile.
--
-- **The newest form is one number, in one place**: `joining_form()`. 0301
-- and 0302 each wrote it in two functions; they ask it now. A new question
-- moves that one function (and `JOINING_FORM` in the app).
--
-- Read only through `people_setup()`, by whoever may send the tour: the
-- same people who already see the ticks.

-- ---------------------------------------------------------------------------
-- The newest form
-- ---------------------------------------------------------------------------
create or replace function public.joining_form()
returns integer
language sql
immutable
as $function$
  select 3;
$function$;

revoke all on function public.joining_form() from public, anon, authenticated;

-- With no form named: the newest — Settings › Onboarding's table and the nudge.
create or replace function public.profile_gaps(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select public.profile_gaps(p_user, public.joining_form());
$function$;

revoke all on function public.profile_gaps(uuid) from public, anon, authenticated;

-- The door of an app that says which form it has: held to the questions it
-- can put, so below 1 is form 1 and above the newest is the newest.
create or replace function public.my_profile_gaps_for(p_form integer)
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(
    public.profile_gaps(auth.uid(), greatest(1, least(coalesce(p_form, 1), public.joining_form()))),
    '{}'::text[]
  );
$function$;

revoke all on function public.my_profile_gaps_for(integer) from public, anon;
grant execute on function public.my_profile_gaps_for(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- When it was finished
-- ---------------------------------------------------------------------------
create table if not exists public.profile_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  form integer not null check (form >= 1),
  completed_at timestamptz not null default now(),
  primary key (user_id, form)
);

comment on table public.profile_completions is
  'The first moment a person had answered every question of a form of the joining form (0301). Written by triggers only; read through people_setup().';

alter table public.profile_completions enable row level security;
-- No policy and no grant: nothing reads or writes it but the functions below.
revoke all on public.profile_completions from public, anon, authenticated;

-- Is every question of the newest form answered for this person? If so,
-- and it has not been said before, now is when.
create or replace function public.profile_completion_note(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_user is null then
    return;
  end if;
  insert into public.profile_completions (user_id, form)
  select p.id, public.joining_form()
  from public.profiles p
  where p.id = p_user
    -- Through the form at all: "Profile complete" in the table means both.
    and p.onboarded_at is not null
    and cardinality(public.profile_gaps(p.id, public.joining_form())) = 0
  on conflict (user_id, form) do nothing;
end;
$function$;

revoke all on function public.profile_completion_note(uuid) from public, anon, authenticated;

-- One watcher for the four places an answer can land.
create or replace function public.profile_completion_watch()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  begin
    if tg_table_name = 'profiles' then
      perform public.profile_completion_note(new.id);
    elsif tg_table_name in ('profile_sensitive', 'household_members') then
      perform public.profile_completion_note(new.user_id);
    elsif tg_table_name = 'households' then
      -- An address belongs to everybody who lives there: a couple finish together.
      perform public.profile_completion_note(m.user_id)
      from public.household_members m
      where m.household_id = new.id and m.kind = 'adult' and m.user_id is not null;
    end if;
  exception when others then
    -- Never in the way of the save it is watching.
    raise warning 'profile_completion_watch on %: %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.profile_completion_watch() from public, anon, authenticated;

drop trigger if exists profiles_completion_watch on public.profiles;
create trigger profiles_completion_watch
  after insert or update on public.profiles
  for each row execute function public.profile_completion_watch();

drop trigger if exists profile_sensitive_completion_watch on public.profile_sensitive;
create trigger profile_sensitive_completion_watch
  after insert or update on public.profile_sensitive
  for each row execute function public.profile_completion_watch();

drop trigger if exists households_completion_watch on public.households;
create trigger households_completion_watch
  after update on public.households
  for each row execute function public.profile_completion_watch();

drop trigger if exists household_members_completion_watch on public.household_members;
create trigger household_members_completion_watch
  after insert or update on public.household_members
  for each row execute function public.profile_completion_watch();

-- Whoever had already finished the newest form when this was applied: the
-- last time anything of theirs was saved. That is the save that finished
-- it, unless they have changed something since — the form was hours old.
insert into public.profile_completions (user_id, form, completed_at)
select p.id, public.joining_form(), greatest(p.updated_at, coalesce(s.updated_at, p.updated_at), coalesce(h.updated_at, p.updated_at))
from public.profiles p
left join public.profile_sensitive s on s.user_id = p.id
left join public.household_members hm on hm.user_id = p.id and hm.kind = 'adult'
left join public.households h on h.id = hm.household_id
where p.onboarded_at is not null
  and cardinality(public.profile_gaps(p.id, public.joining_form())) = 0
on conflict (user_id, form) do nothing;

-- ---------------------------------------------------------------------------
-- The table in Settings › Onboarding carries the date
-- ---------------------------------------------------------------------------
-- A column more is a new return type, so the function is made again; the
-- app in production reads the columns it knows and ignores the rest.
-- `completed_at` is the newest form's: when they first had every answer it
-- asks. It says nothing about now — the gaps do — so the app shows it only
-- beside a profile that is complete.
drop function if exists public.people_setup();

create function public.people_setup()
returns table (user_id uuid, joined boolean, gaps text[], notifications boolean, completed_at timestamptz)
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
    ),
    (select c.completed_at from public.profile_completions c where c.user_id = p.id and c.form = public.joining_form())
  from public.profiles p
  where (select auth.uid()) is not null
    and public.may_onboard((select auth.uid()), p.id);
$function$;

revoke all on function public.people_setup() from public, anon;
grant execute on function public.people_setup() to authenticated;

notify pgrst, 'reload schema';
select public.migration_done(304, '0304_when_somebody_finished_their_details', 'e19fc8ea23b728e2589f774af37bd9af72585c9db9d03859d8bffcf9e67d6dae');
