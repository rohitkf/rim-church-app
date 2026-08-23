-- ============================================================================
-- Profiles
-- ============================================================================
-- Split into a "public" profile (visible to any signed-in user — needed for
-- rosters, message board authorship, service planner assignments, etc.) and
-- a "sensitive" side-table (visa/DBS compliance fields) restricted to the
-- individual and Admin only (PRD Section 17 / Open Question 2 decision).
-- Postgres RLS is row-level, not column-level, so the clean way to hide a
-- handful of columns from most readers is to keep them in a separate table
-- with its own, stricter policy rather than masking columns in one table.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  dob date,
  email text not null,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create table public.profile_sensitive (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  visa_type text,
  has_dbs boolean not null default false,
  visa_expiry date,
  updated_at timestamptz not null default now()
);

alter table public.profile_sensitive enable row level security;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email
  );
  insert into public.profile_sensitive (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger profile_sensitive_touch_updated_at
  before update on public.profile_sensitive
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: profiles (non-sensitive fields — broadly readable)
-- ---------------------------------------------------------------------------
create policy profiles_select_authenticated on public.profiles
  for select using (auth.uid() is not null);

create policy profiles_update_own_or_admin on public.profiles
  for update using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy profiles_admin_insert on public.profiles
  for insert with check (public.is_admin(auth.uid()));

create policy profiles_admin_delete on public.profiles
  for delete using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS: profile_sensitive (Admin + the individual only)
-- ---------------------------------------------------------------------------
create policy profile_sensitive_select_self_or_admin on public.profile_sensitive
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy profile_sensitive_update_self_or_admin on public.profile_sensitive
  for update using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy profile_sensitive_admin_insert on public.profile_sensitive
  for insert with check (public.is_admin(auth.uid()));

create policy profile_sensitive_admin_delete on public.profile_sensitive
  for delete using (public.is_admin(auth.uid()));
