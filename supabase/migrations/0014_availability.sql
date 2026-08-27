-- ============================================================================
-- Availability Tracker
-- ============================================================================
-- Volunteers say up front whether they can serve at an upcoming service,
-- per team they belong to (someone on both Audio and Media may be free
-- for one and not the other, so availability is keyed by department as
-- well as service).
create type public.availability_status as enum ('available', 'unavailable', 'tentative');

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  status public.availability_status not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, service_id, department_id)
);

alter table public.availability enable row level security;

create trigger availability_touch_updated_at
  before update on public.availability
  for each row execute function public.touch_updated_at();

create index availability_service_department_idx
  on public.availability (service_id, department_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Readable by the person themselves, anyone who can see that department's
-- content (its members, its head/assisting head, and Admin), and the
-- coordinator planning that service — they are the people who need to know
-- who is turning up.
create policy availability_select on public.availability
  for select using (
    user_id = auth.uid()
    or public.can_view_department_content(auth.uid(), department_id)
    or public.is_service_coordinator(auth.uid(), service_id)
  );

-- Only you set your own availability; Admin can correct a row on someone's
-- behalf (e.g. a phone call on the day).
create policy availability_insert on public.availability
  for insert with check (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy availability_update on public.availability
  for update using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy availability_delete on public.availability
  for delete using (user_id = auth.uid() or public.is_admin(auth.uid()));
