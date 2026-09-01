-- ============================================================================
-- Church events, and inviting somebody in
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Events the church puts in a diary
-- ----------------------------------------------------------------------------
-- Birthdays and anniversaries were a panel on the dashboard, seen by whoever
-- happened to look that morning, and services lived on the planner. Neither is
-- a place to look up "what is on in March". This table holds the third kind —
-- the things somebody decides on: a members' meeting, a baptism, a workday —
-- and the Events page draws all three together.
create table if not exists public.church_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 120),
  details text check (details is null or length(details) <= 1000),
  -- A date rather than a timestamp: most things in a church diary are "the
  -- 14th", and a start time is optional detail rather than the fact itself.
  event_date date not null,
  start_time time,
  location text check (location is null or length(location) <= 160),
  -- Whose event it is, when it belongs to one team rather than the church.
  department_id uuid references public.departments(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists church_events_by_date on public.church_events (event_date);

alter table public.church_events enable row level security;

-- Everyone reads the diary: an event nobody can see is not an event.
drop policy if exists church_events_select on public.church_events;
create policy church_events_select on public.church_events
  for select using (auth.uid() is not null);

-- Admins put anything in it; a Head or their deputy puts in their own team's.
-- The department_id on the row is what decides, so a Head cannot quietly file
-- an event under a team they do not run.
drop policy if exists church_events_insert on public.church_events;
create policy church_events_insert on public.church_events
  for insert with check (
    created_by = auth.uid()
    and (
      public.is_admin(auth.uid())
      or (department_id is not null
          and public.is_dept_head_or_assisting(auth.uid(), department_id))
    )
  );

drop policy if exists church_events_update on public.church_events;
create policy church_events_update on public.church_events
  for update using (
    public.is_admin(auth.uid())
    or (department_id is not null
        and public.is_dept_head_or_assisting(auth.uid(), department_id))
  )
  with check (
    public.is_admin(auth.uid())
    or (department_id is not null
        and public.is_dept_head_or_assisting(auth.uid(), department_id))
  );

drop policy if exists church_events_delete on public.church_events;
create policy church_events_delete on public.church_events
  for delete using (
    public.is_admin(auth.uid())
    or (department_id is not null
        and public.is_dept_head_or_assisting(auth.uid(), department_id))
  );

create or replace function public.touch_church_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- Who made it is a matter of record, not something an edit can rewrite.
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists church_events_touch on public.church_events;
create trigger church_events_touch before update on public.church_events
  for each row execute function public.touch_church_event();

-- ----------------------------------------------------------------------------
-- Invitations
-- ----------------------------------------------------------------------------
-- Somebody has to be told the app exists before they can sign up for it. The
-- sending is an edge function's job — it needs a key the browser must never
-- hold — and this table is the record: who was asked, by whom, and whether
-- they ever arrived.
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (position('@' in email) > 1 and length(email) <= 320),
  department_id uuid references public.departments(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  -- One invitation per address; a re-invite updates the row rather than
  -- filling the list with the same person five times.
  unique (email)
);

alter table public.invitations enable row level security;

-- Admins see every invitation; a Head sees the ones for their own team, which
-- is what makes "did anyone ask them yet?" answerable.
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select using (
    public.is_admin(auth.uid())
    or (department_id is not null
        and public.is_dept_head_or_assisting(auth.uid(), department_id))
  );

-- Rows are written by the edge function under the service role, which RLS
-- does not apply to, so there is deliberately no insert policy here: the only
-- way to create one is through the function that actually sends the email.
drop policy if exists invitations_delete on public.invitations;
create policy invitations_delete on public.invitations
  for delete using (public.is_admin(auth.uid()));

-- An invitation is answered when the address turns up as a profile. Filling
-- that in from the app would need a policy letting anyone write here; the
-- profile trigger already knows the moment it happens.
create or replace function public.close_invitation_on_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.invitations
     set accepted_at = now()
   where lower(email) = lower(new.email) and accepted_at is null;
  return new;
end;
$$;

drop trigger if exists invitations_close_on_signup on public.profiles;
create trigger invitations_close_on_signup after insert on public.profiles
  for each row execute function public.close_invitation_on_signup();
