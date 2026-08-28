-- ============================================================================
-- Guests on the running order
-- ============================================================================
-- A visiting speaker is not going to have an account, and shouldn't need
-- one to be named against the session they are taking. So a service keeps
-- its own short list of guests, and a session's lead is either somebody
-- with an account or somebody on that list — never both, and never a name
-- typed loose into the session itself.
--
-- Kept per service rather than as a global address book, because that is
-- what a guest is: someone here for this Sunday. Next month's visitor is a
-- different person, and a list that accumulated every guest for ever would
-- be a worse thing to search than the roster it sits beside.
--
-- Referenced by id rather than copied as text, so correcting a spelling
-- fixes it everywhere it appears, and removing a guest leaves the sessions
-- they were on unassigned rather than pointing at a name that has gone.
-- ----------------------------------------------------------------------------

create table if not exists public.service_guests (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- "Guest speaker", "Visiting worship lead", whatever helps whoever reads
  -- the plan on Sunday know who this is.
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  unique (service_id, name)
);

create index if not exists service_guests_service_idx
  on public.service_guests (service_id, name);

alter table public.service_guests enable row level security;

-- The same rule the running order itself has: anyone signed in can read
-- the plan, and only an Admin can change it.
drop policy if exists service_guests_select on public.service_guests;
create policy service_guests_select on public.service_guests
  for select using (auth.uid() is not null);

drop policy if exists service_guests_write on public.service_guests;
create policy service_guests_write on public.service_guests
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

alter table public.service_sessions
  add column if not exists guest_id uuid references public.service_guests(id) on delete set null;

-- One lead per session. Without this, setting a guest without clearing the
-- member would leave two answers to "who is taking this?" and the page
-- would have to pick one — which is a decision better refused than made.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_sessions_one_lead'
  ) then
    alter table public.service_sessions
      add constraint service_sessions_one_lead
      check (assigned_user_id is null or guest_id is null);
  end if;
end $$;
