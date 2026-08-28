-- ============================================================================
-- Telling people something needs them
-- ============================================================================
-- Three things that are really one thing: a head nudging the people who
-- haven't done their checklist, a head nudging the people who haven't said
-- whether they can serve, and a head writing something of their own to the
-- team. All three end as notification rows, which the bell already shows and
-- the push sender already delivers.
--
-- Two additions make that possible:
--
--  1. A notification can carry `body`. Until now a notification's whole
--     meaning was its `type`, which is fine for "someone asked to join your
--     team" and useless for anything a person writes themselves.
--  2. Sending is done by SECURITY DEFINER functions, not by an insert
--     policy. A policy permissive enough to let a head write rows *for other
--     people* is a policy that lets anyone write rows for anyone; a function
--     can check who is asking, work out who it is allowed to reach, and
--     insert exactly those.

alter table public.notifications add column if not exists body text;

-- ---------------------------------------------------------------------------
-- Who may send to whom
-- ---------------------------------------------------------------------------

-- An Admin may reach any team; a head or assisting head only their own.
create or replace function public.may_alert_department(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(uid) or public.is_dept_head_or_assisting(uid, dept_id);
$$;

-- ---------------------------------------------------------------------------
-- The people a nudge is for
-- ---------------------------------------------------------------------------

/**
 * Everyone on a team who has not answered availability for a service.
 *
 * Core members only: a guest is someone helping out on a particular team,
 * not someone who owes an answer every week.
 */
create or replace function public.awaiting_availability(dept_id uuid, svc_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from public.department_members m
  where m.department_id = dept_id
    and m.member_type = 'core'
    and not exists (
      select 1 from public.availability a
      where a.user_id = m.user_id
        and a.department_id = dept_id
        and a.service_id = svc_id
    );
$$;

/**
 * Everyone rostered on a service whose checklist still has an item their
 * own tick hasn't reached.
 *
 * The member's stage is what is being chased here: an item waiting on a
 * head's verification is not the member's problem, and telling them
 * otherwise teaches people to ignore the app.
 */
create or replace function public.awaiting_checklist(svc_id uuid, dept_id uuid default null)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct a.user_id
  from public.rota_assignments a
  join public.department_role_checklist_items i on i.role_id = a.role_id
  left join public.rota_checklist_progress p
    on p.assignment_id = a.id and p.item_id = i.id
  where a.service_id = svc_id
    and (dept_id is null or a.department_id = dept_id)
    and coalesce(p.status, 'pending') = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- Sending
-- ---------------------------------------------------------------------------

/**
 * The shared tail of every send: write one notification each, skipping the
 * sender (nobody needs telling about their own nudge) and anyone who
 * already has an unread one of the same kind for the same thing — a head
 * pressing the button twice should not buzz a phone twice.
 */
create or replace function public.notify_people(
  recipients uuid[],
  kind text,
  ref uuid,
  message text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  insert into public.notifications (user_id, type, reference_id, body)
  select r, kind, ref, message
  from unnest(recipients) as r
  where r <> auth.uid()
    and not exists (
      select 1 from public.notifications n
      where n.user_id = r
        and n.type = kind
        and n.read_boolean = false
        and n.reference_id is not distinct from ref
        and n.created_at > now() - interval '6 hours'
    );
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

/** A head nudges their team's unanswered availability for one service. */
create or replace function public.nudge_availability(dept_id uuid, svc_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.may_alert_department(auth.uid(), dept_id) then
    raise exception 'Only an Admin or that team''s head can send this.';
  end if;
  return public.notify_people(
    array(select user_id from public.awaiting_availability(dept_id, svc_id)),
    'availability_reminder',
    svc_id
  );
end;
$$;

/** A head nudges whoever still owes a checklist tick for one service. */
create or replace function public.nudge_checklist(svc_id uuid, dept_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if dept_id is null then
    if not public.is_admin(auth.uid()) then
      raise exception 'Only an Admin can nudge every team at once.';
    end if;
  elsif not public.may_alert_department(auth.uid(), dept_id) then
    raise exception 'Only an Admin or that team''s head can send this.';
  end if;
  return public.notify_people(
    array(select user_id from public.awaiting_checklist(svc_id, dept_id)),
    'checklist_reminder',
    svc_id
  );
end;
$$;

/**
 * A head writes to their team.
 *
 * `svc_id` narrows it from "everyone on the team" to "the people this
 * service actually needs": anyone rostered on it, plus anyone who said they
 * can or might be able to serve. Someone who has said no is not chased
 * about a service they already answered for.
 */
create or replace function public.alert_team(
  dept_id uuid,
  message text,
  svc_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  recipients uuid[];
begin
  if not public.may_alert_department(auth.uid(), dept_id) then
    raise exception 'Only an Admin or that team''s head can send this.';
  end if;
  if message is null or length(btrim(message)) = 0 then
    raise exception 'An alert needs something to say.';
  end if;
  if length(message) > 500 then
    raise exception 'Keep an alert under 500 characters.';
  end if;

  if svc_id is null then
    recipients := array(
      select user_id from public.department_members where department_id = dept_id
    );
  else
    recipients := array(
      select user_id from public.rota_assignments
      where service_id = svc_id and department_id = dept_id
      union
      select user_id from public.availability
      where service_id = svc_id
        and department_id = dept_id
        and status in ('available', 'tentative')
    );
  end if;

  return public.notify_people(recipients, 'team_alert', coalesce(svc_id, dept_id), btrim(message));
end;
$$;

-- notify_people is the one that will write a row for anybody: it is the
-- shared tail, and only the three checked entry points above may call it.
-- The API roles exist on Supabase but not on a bare Postgres, so the grants
-- are guarded rather than assumed.
do $$
begin
  revoke all on function public.notify_people(uuid[], text, uuid, text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.notify_people(uuid[], text, uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.notify_people(uuid[], text, uuid, text) from authenticated;
    grant execute on function public.nudge_availability(uuid, uuid) to authenticated;
    grant execute on function public.nudge_checklist(uuid, uuid) to authenticated;
    grant execute on function public.alert_team(uuid, text, uuid) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Friday and Saturday, 8pm: whoever still hasn't said
-- ---------------------------------------------------------------------------
-- The weekend before a Sunday service is when an unanswered availability
-- becomes a problem, so the app asks rather than waiting for a head to
-- notice. Same de-duplication as the manual nudge, so someone who was
-- nudged by their head at 6pm is not asked again at 8.

create or replace function public.remind_unanswered_availability()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer := 0;
  sent integer;
  svc record;
begin
  for svc in
    select id from public.services
    where date >= current_date and date <= current_date + interval '3 days'
  loop
    insert into public.notifications (user_id, type, reference_id)
    select m.user_id, 'availability_reminder', svc.id
    from public.department_members m
    where m.member_type = 'core'
      and not exists (
        select 1 from public.availability a
        where a.user_id = m.user_id
          and a.department_id = m.department_id
          and a.service_id = svc.id
      )
      and not exists (
        select 1 from public.notifications n
        where n.user_id = m.user_id
          and n.type = 'availability_reminder'
          and n.reference_id = svc.id
          and n.created_at > now() - interval '20 hours'
      );
    get diagnostics sent = row_count;
    total := total + sent;
  end loop;
  return total;
end;
$$;

-- Nobody calls this from the app; the scheduler is its only caller.
do $$
begin
  revoke all on function public.remind_unanswered_availability() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.remind_unanswered_availability() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.remind_unanswered_availability() from authenticated;
  end if;
end $$;

-- pg_cron runs in UTC. Change these two lines if the church is not in the
-- UK — 20:00 local is what was asked for, and BST is UTC+1 in summer.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('rim-availability-reminder')
      where exists (select 1 from cron.job where jobname = 'rim-availability-reminder');
    perform cron.schedule(
      'rim-availability-reminder',
      '0 19 * * 5,6',
      $cron$select public.remind_unanswered_availability();$cron$
    );
  end if;
end $$;
