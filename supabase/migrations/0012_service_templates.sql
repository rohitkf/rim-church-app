-- ============================================================================
-- Service templates
-- ============================================================================
-- A template captures the usual running order for a kind of service (its
-- sessions, their durations, and the usual first-session start time), so
-- creating next week's service doesn't mean re-typing the same timeline.
-- Assignments and role links are deliberately NOT templated — who's doing
-- what changes week to week; the timeline shape is what repeats.
create table public.service_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_time time not null default '10:00',
  created_at timestamptz not null default now()
);

alter table public.service_templates enable row level security;

create table public.service_template_sessions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.service_templates(id) on delete cascade,
  order_index int not null,
  session_name text not null,
  duration_minutes int not null default 0,
  unique (template_id, order_index)
);

alter table public.service_template_sessions enable row level security;

create policy service_templates_select on public.service_templates
  for select using (auth.uid() is not null);

create policy service_templates_admin_write on public.service_templates
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy service_template_sessions_select on public.service_template_sessions
  for select using (auth.uid() is not null);

create policy service_template_sessions_admin_write on public.service_template_sessions
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
