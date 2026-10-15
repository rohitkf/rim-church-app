-- A tour of the app, in chapters, by standing.
--
-- A new account used to get three welcome cards and then the whole app at
-- once. Now there is a tour: it walks the pages, one tooltip at a time,
-- and it is cut by standing — a Church Member is shown what a Church
-- Member can open, somebody put on a team is shown the team's pages the
-- next time they open the app, a new Head the controls a Head has, a new
-- Admin the settings. Each chapter is shown once; the app decides which
-- chapters a person is due by their standing and what they have seen.
--
-- The "seen" is on the account rather than in the browser, like the old
-- welcome's `welcomed_at`: sign in on a phone after doing it on a laptop
-- and you are not toured twice. And an Admin can send the tour again — to
-- everybody or to a few — which is the one write here that is not your
-- own.

create table public.onboarding (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- chapter key -> when it was finished or skipped, as an ISO timestamp
  seen jsonb not null default '{}'::jsonb,
  -- The last time somebody sent this person the tour. A chapter seen
  -- before that is due again; one seen after it is done.
  pushed_at timestamptz,
  pushed_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint onboarding_seen_is_an_object check (jsonb_typeof(seen) = 'object')
);

alter table public.onboarding enable row level security;

-- Nobody writes these rows directly, not even their own: the two functions
-- below are the only way, and 0151 is why that is said out loud.
revoke insert, update, delete on public.onboarding from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Who may send the tour
-- ---------------------------------------------------------------------------
-- A row in the church's grid, so it can be widened to Heads for their own
-- team one day. Admin by default; nobody else.
insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('people.onboard', 'admin', '{none,all}', 'all'),
  ('people.onboard', 'head', '{none,team,all}', 'none'),
  ('people.onboard', 'coordinator', '{none}', 'none'),
  ('people.onboard', 'member', '{none,team,all}', 'none'),
  ('people.onboard', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

/* Whether `who` may send the tour to `target`: everywhere, or on a team they both share. */
create or replace function public.may_onboard(who uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select public.may(who, 'people.onboard')
    or exists (
      select 1 from public.department_members dm
      where dm.user_id = target
        and public.may(who, 'people.onboard', dm.department_id)
    );
$function$;

-- Read by the policy below as whoever is asking, so they need to be able
-- to run it. It answers only yes or no about two ids, like may() itself.
revoke all on function public.may_onboard(uuid, uuid) from public, anon;
grant execute on function public.may_onboard(uuid, uuid) to authenticated;

create policy onboarding_select on public.onboarding
  for select using (user_id = auth.uid() or public.may_onboard(auth.uid(), user_id));

-- ---------------------------------------------------------------------------
-- Your own progress
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_mark_seen(p_chapters text[])
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  stamp jsonb;
begin
  if me is null then
    raise exception 'Sign in first';
  end if;
  if p_chapters is null or cardinality(p_chapters) = 0 then
    return;
  end if;
  select coalesce(jsonb_object_agg(c, to_jsonb(now())), '{}'::jsonb) into stamp
  from unnest(p_chapters) as c
  where c ~ '^[a-z_]{1,40}$';

  insert into public.onboarding (user_id, seen, updated_at)
  values (me, stamp, now())
  on conflict (user_id) do update
    set seen = public.onboarding.seen || excluded.seen,
        updated_at = now();
end;
$function$;

revoke all on function public.onboarding_mark_seen(text[]) from public, anon;
grant execute on function public.onboarding_mark_seen(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Sending it
-- ---------------------------------------------------------------------------
-- Null means everybody. Each person gets a bell notification saying so,
-- and the tour itself opens the next time they open the app.
create or replace function public.push_onboarding(p_users uuid[])
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
    select coalesce(array_agg(p.id), '{}') into targets from public.profiles p;
  else
    select coalesce(array_agg(distinct u), '{}') into targets from unnest(p_users) as u;
  end if;

  if exists (select 1 from unnest(targets) as t where not public.may_onboard(me, t)) then
    raise exception 'Sending the tour to those people is not open to you.';
  end if;

  insert into public.onboarding (user_id, pushed_at, pushed_by, updated_at)
  select t, now(), me, now() from unnest(targets) as t
  on conflict (user_id) do update
    set pushed_at = now(), pushed_by = excluded.pushed_by, updated_at = now();
  get diagnostics n = row_count;

  perform public.notify_people(targets, 'tour_pushed', null, 'A tour of the app is waiting for you. It opens the next time you open the app.');
  return n;
end;
$function$;

revoke all on function public.push_onboarding(uuid[]) from public, anon;
grant execute on function public.push_onboarding(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Everybody already here has seen the app
-- ---------------------------------------------------------------------------
-- A tour of an app you have used for weeks is a bug wearing a party hat,
-- so every existing account is marked as having seen every chapter there
-- is today. A chapter they gain later — joining a team, being made a Head —
-- is new to them and still comes; the whole thing comes again only when an
-- Admin sends it.
insert into public.onboarding (user_id, seen)
select p.id, (
  select jsonb_object_agg(c, to_jsonb(now()))
  from unnest(array['welcome', 'around', 'church', 'serving', 'team', 'talk', 'leading', 'running', 'owner']) as c
)
from public.profiles p
on conflict (user_id) do nothing;
