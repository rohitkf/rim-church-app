/*
 * What was said after the service, kept for a while and then let go.
 *
 * Every team talks after a Sunday — what ran late, what nobody could hear,
 * who needs showing how to do the thing that went wrong. That conversation
 * has been living in people's heads and in four separate WhatsApp groups,
 * which means the head who was away misses it and nothing carries into
 * next week.
 *
 * So: minutes. One set per team per service, written by whoever runs the
 * team, readable by the whole church — a debrief is how a church learns
 * about itself, and a note only its own team can read is how the same
 * problem gets solved twice.
 *
 * **And they expire.** Minutes are working notes, not an archive: they say
 * "the radio mic was dead again" and name the person who forgot the
 * batteries. Kept for ever that becomes a file on somebody. Kept for a
 * month it is a team remembering last Sunday, which is all anybody wanted.
 * The month is a setting, and the clock runs from the service — so every
 * team's minutes for one Sunday expire together, whenever they were typed.
 */

create table if not exists public.service_debriefs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  minutes text not null check (length(btrim(minutes)) > 0 and length(minutes) <= 8000),
  /** Whoever wrote them, kept so a reader knows whose account this is. */
  written_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One per team per service: a debrief is a meeting, and a team has one
  -- of those about one Sunday.
  unique (service_id, department_id)
);

comment on table public.service_debriefs is
  'A team''s minutes from the debrief after a service. One per team per service, deleted once the retention window from the service date has passed.';

alter table public.service_debriefs enable row level security;

create trigger service_debriefs_touch_updated_at
  before update on public.service_debriefs
  for each row execute function public.touch_updated_at();

create index if not exists service_debriefs_by_service
  on public.service_debriefs (service_id);

-- Read by anybody signed in: a debrief is how a church learns about
-- itself, and minutes only one team can read solve the same problem twice.
create policy service_debriefs_select on public.service_debriefs
  for select using (auth.uid() is not null);

/*
 * Written by whoever runs the team — head or assisting head — or an Admin.
 *
 * `is_dept_head` already covers both deputies. The author is stamped as
 * themselves rather than taken on trust from the client, so a name on a
 * set of minutes is somebody who actually wrote them.
 */
create policy service_debriefs_insert on public.service_debriefs
  for insert with check (
    written_by = auth.uid()
    and (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id))
  );

create policy service_debriefs_update on public.service_debriefs
  for update using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

create policy service_debriefs_delete on public.service_debriefs
  for delete using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

-- ---------------------------------------------------------------------------
-- How long they are kept
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists debrief_retention_days integer not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_settings_debrief_retention_is_sane'
  ) then
    alter table public.app_settings
      add constraint app_settings_debrief_retention_is_sane
      check (debrief_retention_days between 1 and 365);
  end if;
end $$;

comment on column public.app_settings.debrief_retention_days is
  'Days after a service that its debrief minutes are kept. The clock runs from the service date, so every team''s minutes for one Sunday go together.';

/**
 * The moment a service's minutes stop being kept.
 *
 * Measured from the service's own date rather than from when anybody
 * typed, so a team writing theirs up on the Thursday does not buy itself
 * four extra days. Midnight at the end of the last day they are kept, in
 * the church's own timezone — a deadline is not a moment until somebody
 * says where.
 */
create or replace function public.debrief_expires_at(svc_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((s.date + coalesce(a.debrief_retention_days, 30) + 1)::date)::timestamp
           at time zone public.church_timezone()
  from public.services s
  left join public.app_settings a on true
  where s.id = svc_id;
$$;

/**
 * Let go of everything past its day.
 *
 * A plain delete rather than a flag: the point of a retention window is
 * that the words are gone, and a row marked hidden is still a row
 * somebody can be shown.
 */
create or replace function public.delete_expired_debriefs()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.service_debriefs d
  where public.debrief_expires_at(d.service_id) <= now();
$$;

-- Nightly, so minutes outlive their window by hours at most. pg_cron ships
-- with Supabase but not with the bare Postgres image CI dry-runs these
-- against, so the schedule is guarded the way 0010's is.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'delete-expired-debriefs',
      '30 2 * * *', -- 02:30 UTC, when nobody is reading them
      $job$ select public.delete_expired_debriefs(); $job$
    );
  else
    raise notice 'pg_cron unavailable; skipping debrief expiry schedule';
  end if;
end $$;

-- Two screens on a Sunday evening: a head typing and everybody else
-- reading.
do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_debriefs'
  ) then
    alter publication supabase_realtime add table public.service_debriefs;
  end if;
end $pub$;
