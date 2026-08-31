-- ============================================================================
-- Settings: the numbers that decide when things appear
-- ============================================================================
-- Every window in this app was a constant somebody chose once — a week of
-- services on the rota, six on the planner, doors open half an hour early,
-- an hour to put a finished service right, the board clearing on a Tuesday.
-- They are reasonable defaults and they are not universal: a church with a
-- midweek service, or one that plans a month out, has different answers.
--
-- One row, read by everyone, written by Admins. It is a single row on
-- purpose: these are the church's settings, not a per-person preference,
-- and a table that can only ever hold one row cannot drift into two that
-- disagree.
create table if not exists public.app_settings (
  -- The one-row lock: `true` is the only value this column accepts, and it
  -- is the primary key, so a second row is a constraint violation rather
  -- than a bug nobody notices for a month.
  id boolean primary key default true check (id),

  -- How far ahead the Team Rota and the availability tracker list services.
  rota_window_days integer not null default 7
    check (rota_window_days between 1 and 120),
  -- Whether a service you are personally rostered on is shown however far
  -- out it is. Off, and a volunteer can be assigned to something they
  -- cannot see.
  always_show_my_services boolean not null default true,
  -- How many services the Service Planner's agenda lists.
  planner_upcoming_limit integer not null default 6
    check (planner_upcoming_limit between 1 and 50),

  -- When a service starts reading as "on now", and how long it keeps
  -- reading that way after the last session ends.
  lead_in_minutes integer not null default 30 check (lead_in_minutes between 0 and 240),
  run_out_minutes integer not null default 15 check (run_out_minutes between 0 and 240),

  -- How long after a service ends an Admin can still correct the record.
  -- Enforced below by service_has_finished, which is the actual lock — the
  -- page only decides whether to offer the buttons.
  edit_grace_minutes integer not null default 60
    check (edit_grace_minutes between 0 and 10080),

  -- The day the message board empties and the planner's finished list
  -- turns over. 0 is Sunday, matching Postgres and JavaScript both.
  board_clear_dow integer not null default 2 check (board_clear_dow between 0 and 6),

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Everyone reads them: a member's rota page cannot draw the right window
-- without knowing what the window is.
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select using (auth.uid() is not null);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for update using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create or replace function public.touch_app_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  -- The row is the settings; there is never a second one to create or
  -- destroy, so the id is not the caller's to change.
  new.id := true;
  return new;
end;
$$;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_app_settings();

-- ----------------------------------------------------------------------------
-- The grace period stops being an hour and starts being whatever the church
-- set. This function is the lock every write to a finished service passes
-- through, so the setting is real rather than advisory.
-- ----------------------------------------------------------------------------
create or replace function public.service_has_finished(svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    coalesce(
      (select ended_at from public.services where id = svc_id),
      (select max(start_time + make_interval(mins => coalesce(duration_minutes, 0)))
       from public.service_sessions where service_id = svc_id)
    ) + make_interval(mins => (select edit_grace_minutes from public.app_settings)) < now(),
    false
  );
$$;

-- ----------------------------------------------------------------------------
-- The board's clear-out moves from a day baked into a cron expression to a
-- day read from the settings. The job runs every night and does nothing on
-- six of them, which is cheaper than teaching the app to reschedule cron.
-- ----------------------------------------------------------------------------
create or replace function public.clear_message_board_if_due()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(dow from (now() at time zone 'utc'))::int
     <> (select board_clear_dow from public.app_settings) then
    return;
  end if;
  delete from public.notifications where type = 'message';
  delete from public.messages where ctid is not null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('clear-message-board')
      where exists (select 1 from cron.job where jobname = 'clear-message-board');
    perform cron.schedule(
      'clear-message-board',
      '0 0 * * *', -- every night; the function decides whether it is the day
      $job$select public.clear_message_board_if_due();$job$
    );
  else
    raise notice 'pg_cron unavailable; skipping message board clear schedule';
  end if;
end $$;
