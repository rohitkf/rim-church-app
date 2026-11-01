-- Who has allowed location on their phone, and asking those who have not.
--
-- Clocking in needs the phone's location, and nobody running the church
-- could see whose phone gives it. Each time the app opens it now says what
-- this phone's location answer is — allowed, blocked, or not asked yet —
-- and which kind of phone it is, so Settings › Onboarding can list
-- everybody, the way it lists the tour. Whoever may send the tour may also
-- ask somebody to allow location: they get a notification that opens the
-- page explaining how, for an iPhone and for Android.
--
-- One row a person: the phone they opened the app on last. Somebody with
-- two phones shows the one they used most recently, which is the one they
-- are likely to bring on a Sunday.

create table public.location_access (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- 'granted' and 'denied' are what a request for a position did; 'unknown'
  -- is a phone that has not been asked, or has not said (lib/locationPermission).
  state text not null default 'unknown' check (state in ('granted', 'denied', 'unknown')),
  platform text not null default 'other' check (platform in ('ios', 'android', 'desktop', 'other')),
  installed boolean not null default false,
  reported_at timestamptz,
  asked_at timestamptz,
  asked_by uuid references public.profiles (id) on delete set null
);

create index location_access_asked_by_idx on public.location_access (asked_by);

alter table public.location_access enable row level security;

-- Your own, and whoever you may send the tour to: the same people.
create policy location_access_select on public.location_access
  for select using (user_id = (select auth.uid()) or public.may_onboard((select auth.uid()), user_id));

-- ---------------------------------------------------------------------------
-- What this phone says
-- ---------------------------------------------------------------------------
create or replace function public.report_location_access(p_state text, p_platform text, p_installed boolean)
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
  if p_state not in ('granted', 'denied', 'unknown') then
    raise exception 'Not a location answer: %', p_state;
  end if;

  insert into public.location_access (user_id, state, platform, installed, reported_at)
  values (
    me,
    p_state,
    case when p_platform in ('ios', 'android', 'desktop') then p_platform else 'other' end,
    coalesce(p_installed, false),
    now()
  )
  on conflict (user_id) do update
    set state = excluded.state,
        platform = excluded.platform,
        installed = excluded.installed,
        reported_at = now();

  -- Allowed now: the request to allow it has done its job.
  if p_state = 'granted' then
    update public.notifications
      set read_boolean = true
      where user_id = me and type = 'location_prompt' and read_boolean = false;
  end if;
end;
$function$;

revoke all on function public.report_location_access(text, text, boolean) from public, anon;
grant execute on function public.report_location_access(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Asking somebody to allow it
-- ---------------------------------------------------------------------------
-- To these people, or, when p_users is null, to everybody whose phone has
-- not said it allows location. Returns how many were asked.
create or replace function public.prompt_location(p_users uuid[])
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
    left join public.location_access l on l.user_id = p.id
    where coalesce(l.state, 'unknown') <> 'granted'
      and public.may_onboard(me, p.id);
  else
    select coalesce(array_agg(distinct u), '{}') into targets from unnest(p_users) as u;
    if exists (select 1 from unnest(targets) as t where not public.may_onboard(me, t)) then
      raise exception 'Asking those people is not open to you.';
    end if;
  end if;

  if cardinality(targets) = 0 then
    return 0;
  end if;

  insert into public.location_access (user_id, asked_at, asked_by)
  select t, now(), me from unnest(targets) as t
  on conflict (user_id) do update
    set asked_at = now(), asked_by = excluded.asked_by;
  get diagnostics n = row_count;

  -- One request each in the bell: an older unread one is replaced, not stacked.
  update public.notifications
    set read_boolean = true
    where user_id = any (targets) and type = 'location_prompt' and read_boolean = false;

  perform public.notify_people(
    targets,
    'location_prompt',
    null,
    'Please allow location for the app on this phone, so you can clock in on Sunday. Tap to see how.'
  );
  return n;
end;
$function$;

revoke all on function public.prompt_location(uuid[]) from public, anon;
grant execute on function public.prompt_location(uuid[]) to authenticated;
