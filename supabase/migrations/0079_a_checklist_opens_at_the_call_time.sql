-- ============================================================================
-- A checklist opens when the team is due in, not before
-- ============================================================================
-- Checking a box means "I have done this thing, here, now". Until this
-- migration the box could be ticked from an armchair on a Thursday, and a
-- list ticked at home is not a list — it is a formality that says nothing
-- about whether the camera has a battery in it.
--
-- So the window is the one the volunteers already understand: from the
-- team's call time on the day of the service, until the service finishes.
-- Both ends are now the database's answer rather than the page's. The
-- far end has been closed since 0047; this closes the near one.
--
-- The call time is per team per day (0076), and seven o'clock when nobody
-- has said otherwise — the same default the panel on the rota shows, kept
-- in step here by hand because a constant in two languages is the one
-- thing this repository has already apologised for once.
--
-- Two exemptions, and only two:
--
--   * An Admin. They already walk through the stage guard below, and
--     somebody has to be able to put a service right afterwards.
--   * A service with no row in `services` — impossible through the app,
--     and locking a checklist forever over missing data would be worse
--     than the thing this prevents.
--
-- Everyone else — the volunteer, the Head, the Assisting Head, the
-- Coordinator, whoever signs off — waits for the call time. A Head cannot
-- verify what nobody could have ticked yet, so there is nothing to make an
-- exception for.
--
-- Times are read in Europe/London, which is where the building is. A
-- wall-clock call time has to be given a zone by somebody, and the church
-- is a better answer than the server's. Somebody reading from another
-- country sees the page unlock on their own clock a few hours out; the
-- database is what actually decides, and it decides in London.
-- ----------------------------------------------------------------------------

-- The church's own clock, in one place.
create or replace function public.church_timezone()
returns text language sql immutable as $$ select 'Europe/London'::text $$;

-- What a team is due at on a day: what was set for it, or seven.
create or replace function public.call_time_for(dept_id uuid, on_day date)
returns time
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select ct.call_time
      from public.department_call_times ct
      where ct.department_id = dept_id and ct.on_date = on_day
    ),
    time '07:00'
  );
$$;

-- That time on that morning, as a moment.
create or replace function public.checklist_opens_at(dept_id uuid, svc_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (s.date + public.call_time_for(dept_id, s.date))
           at time zone public.church_timezone()
  from public.services s
  where s.id = svc_id;
$$;

-- Whether that moment has come. Null — no such service — reads as open,
-- so a broken row is a visible mess rather than a silent permanent lock.
create or replace function public.checklist_is_open(dept_id uuid, svc_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(now() >= public.checklist_opens_at(dept_id, svc_id), true);
$$;

-- The same question, asked the way the progress table can ask it.
create or replace function public.assignment_checklist_is_open(assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.checklist_is_open(
    public.rota_assignment_department(assignment_id),
    public.rota_assignment_service(assignment_id)
  );
$$;

-- ----------------------------------------------------------------------------
-- The role checklists — the ones a volunteer actually ticks
-- ----------------------------------------------------------------------------
-- Carried forward from 0051 with the new clause added: everything that was
-- true about who may write stays true, and now when.
drop policy if exists rota_checklist_progress_write on public.rota_checklist_progress;
create policy rota_checklist_progress_write on public.rota_checklist_progress
  for all using (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or (
        public.assignment_checklist_is_open(assignment_id)
        and (
          auth.uid() = public.rota_assignment_user(assignment_id)
          or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
          or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
          or public.is_rota_coordinator(auth.uid(), assignment_id)
        )
      )
    )
  )
  with check (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or (
        public.assignment_checklist_is_open(assignment_id)
        and (
          auth.uid() = public.rota_assignment_user(assignment_id)
          or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
          or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
          or public.is_rota_coordinator(auth.uid(), assignment_id)
        )
      )
    )
  );

-- A policy refuses in the language of policies — "new row violates
-- row-level security" — which tells a volunteer nothing. The guard runs
-- first and can say what is actually true, so it says it. The policy above
-- is still what enforces this; this is what explains it.
create or replace function public.guard_checklist_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opens timestamptz;
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;
  -- An insert that lands on 'pending' claims nothing, and on update only
  -- a change of stage is a claim. OLD is not there to read on an insert,
  -- so the two cases are asked separately rather than coalesced.
  if tg_op = 'INSERT' and new.status = 'pending' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  opens := public.checklist_opens_at(
    public.rota_assignment_department(new.assignment_id),
    public.rota_assignment_service(new.assignment_id)
  );
  if opens is not null and now() < opens then
    raise exception 'This checklist opens at your team''s call time on the day of the service (% church time).',
      to_char(opens at time zone public.church_timezone(), 'HH24:MI on FMDay DD FMMonth');
  end if;
  return new;
end;
$$;

-- Named to sort before `rota_checklist_progress_guard`, because triggers
-- on one table fire in alphabetical order and "it is not open yet" is the
-- truer reason than "you cannot sign that stage".
drop trigger if exists rota_checklist_progress_call_time_window on public.rota_checklist_progress;
create trigger rota_checklist_progress_call_time_window
  before insert or update on public.rota_checklist_progress
  for each row execute function public.guard_checklist_window();

-- ----------------------------------------------------------------------------
-- The per-service task list, which is ticked the same way
-- ----------------------------------------------------------------------------
-- `checklist_items` carries the other three-stage list — the ad-hoc tasks a
-- Head adds for one service. Adding and removing those is preparation and
-- stays open; ticking one is the same claim as above and waits for the same
-- moment. A trigger rather than the policy, so a Head can still write the
-- list on the Saturday.
create or replace function public.guard_checklist_item_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  opens timestamptz;
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;

  opens := public.checklist_opens_at(
    public.checklist_department(new.checklist_id),
    public.checklist_service(new.checklist_id)
  );
  if opens is not null and now() < opens then
    raise exception 'This checklist opens at your team''s call time on the day of the service (% church time).',
      to_char(opens at time zone public.church_timezone(), 'HH24:MI on FMDay DD FMMonth');
  end if;
  return new;
end;
$$;

drop trigger if exists checklist_items_call_time_window on public.checklist_items;
create trigger checklist_items_call_time_window
  before update on public.checklist_items
  for each row execute function public.guard_checklist_item_window();
