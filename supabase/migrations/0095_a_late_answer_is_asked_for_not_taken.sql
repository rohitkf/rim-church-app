/*
 * After the deadline, an answer is asked for rather than taken.
 *
 * 0092 shut the availability window at 23:59 the night before, which is
 * the point: a head planning a Sunday morning needs the answers settled
 * while there is still an evening to do something about them. But life
 * does not stop at 23:59. Somebody's child is ill on the Sunday morning;
 * somebody else's meeting is cancelled and they are free after all. Until
 * now the door was simply shut, and the only way through it was to find an
 * Admin and have them type it in on your behalf.
 *
 * So there is a door with a bell on it. After the deadline a member asks
 * to change their answer; the team's head or assisting head — or an Admin —
 * approves or rejects it. Nothing about the rota moves on the asking: the
 * answer changes at the moment somebody approves it, and not before, which
 * is the whole difference between this and simply reopening the window.
 *
 * An approved request writes the availability row the same way the member
 * would have, so everything already hanging off that row still happens —
 * including 0092's rule that somebody going unavailable gives back the
 * role they were holding and tells the heads.
 */

create type public.availability_request_status as enum ('pending', 'approved', 'rejected');

create table if not exists public.availability_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  /** What they are asking their answer to become. */
  requested_status public.availability_status not null,
  /** Why, in their words. The thing a head actually decides on. */
  reason text,
  status public.availability_request_status not null default 'pending',
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  /** A head's word back, mostly used when the answer is no. */
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.availability_change_requests is
  'A member asking to set or change their availability after the window has closed. Applied only when approved.';

alter table public.availability_change_requests enable row level security;

create trigger availability_change_requests_touch_updated_at
  before update on public.availability_change_requests
  for each row execute function public.touch_updated_at();

-- One open ask at a time per person, per team, per service — so a head is
-- never looking at two answers from the same person and having to guess
-- which is the current one.
create unique index if not exists availability_change_requests_one_pending
  on public.availability_change_requests (user_id, service_id, department_id)
  where status = 'pending';

create index if not exists availability_change_requests_pending_idx
  on public.availability_change_requests (department_id, service_id) where status = 'pending';

/*
 * Seen by the person who asked, by the people who can answer it, and by
 * the coordinator planning the service — the same audience that can
 * already see the availability row it is about.
 */
create policy availability_change_requests_select on public.availability_change_requests
  for select using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
    or public.is_service_coordinator(auth.uid(), service_id)
  );

/*
 * Raised for yourself, for a team you are on, and only once the window has
 * shut.
 *
 * Before the deadline there is nothing to ask for: the answer is yours to
 * change, and a request would be a slower way to do what a tap already
 * does. After the service has finished there is nothing to ask for either.
 */
create policy availability_change_requests_insert on public.availability_change_requests
  for insert with check (
    user_id = auth.uid()
    and status = 'pending'
    and public.is_dept_member(auth.uid(), department_id)
    and public.availability_is_closed(service_id)
    and not public.service_has_finished(service_id)
  );

-- Answered by the team's head or assisting head, or by an Admin.
create policy availability_change_requests_decide on public.availability_change_requests
  for update using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

-- Thought better of it before anybody answered.
create policy availability_change_requests_delete on public.availability_change_requests
  for delete using (
    (user_id = auth.uid() and status = 'pending') or public.is_admin(auth.uid())
  );

/*
 * Approval is what writes the answer.
 *
 * As the definer, because the whole point is that the window is shut: the
 * member cannot write this row themselves any more, and neither could the
 * head on their behalf. The write is an ordinary upsert on `availability`,
 * so every rule already hanging off that table still fires — most
 * importantly 0092's, which frees the rota and tells the heads when
 * somebody drops out.
 */
create or replace function public.availability_request_applies_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;

  insert into public.availability (user_id, service_id, department_id, status, note)
  values (new.user_id, new.service_id, new.department_id, new.requested_status, new.reason)
  on conflict (user_id, service_id, department_id)
  do update set status = excluded.status, note = coalesce(excluded.note, availability.note);

  return new;
end;
$$;

-- Triggers on one table fire in alphabetical order; these two do not
-- depend on each other, so the order does not matter. They are separate
-- because one is about the answer and the other is about telling somebody.
drop trigger if exists availability_request_apply on public.availability_change_requests;
create trigger availability_request_apply
  after update of status on public.availability_change_requests
  for each row execute function public.availability_request_applies_on_approval();

/*
 * Somebody is waiting on this, so somebody is told about it.
 *
 * In the app, as everything here is: the heads and assisting heads of the
 * team it concerns, never the whole church, and never by email.
 */
create or replace function public.availability_request_tells_the_heads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare who text; team text; svc text;
begin
  select coalesce(p.first_name || ' ' || p.last_name, 'Somebody') into who
    from public.profiles p where p.id = new.user_id;
  select d.name into team from public.departments d where d.id = new.department_id;
  select s.service_type || ' on ' || to_char(s.date, 'FMDay FMDD Mon') into svc
    from public.services s where s.id = new.service_id;

  insert into public.notifications (user_id, type, reference_id, body)
  select ur.user_id, 'availability_change_request', new.id,
         who || ' asks to be marked ' || new.requested_status::text || ' for ' ||
         coalesce(team, 'your team') || ' at ' || coalesce(svc, 'an upcoming service') ||
         ' — answers had already closed'
  from public.user_roles ur
  where ur.department_id = new.department_id
    and ur.role_type in ('department_head', 'assisting_head')
    and ur.user_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists availability_request_asks on public.availability_change_requests;
create trigger availability_request_asks
  after insert on public.availability_change_requests
  for each row execute function public.availability_request_tells_the_heads();

/** And the person who asked hears back, either way. */
create or replace function public.availability_request_tells_the_asker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare team text; svc text;
begin
  if new.status = old.status then return new; end if;

  select d.name into team from public.departments d where d.id = new.department_id;
  select s.service_type || ' on ' || to_char(s.date, 'FMDay FMDD Mon') into svc
    from public.services s where s.id = new.service_id;

  insert into public.notifications (user_id, type, reference_id, body)
  values (
    new.user_id, 'availability_change_decision', new.id,
    case when new.status = 'approved'
      then 'Your answer for ' || coalesce(team, 'your team') || ' at ' ||
           coalesce(svc, 'the service') || ' is now ' || new.requested_status::text
      else 'Your request to change your answer for ' || coalesce(team, 'your team') ||
           ' at ' || coalesce(svc, 'the service') || ' was not approved'
    end || coalesce(' — ' || nullif(btrim(new.decision_note), ''), '')
  );

  return new;
end;
$$;

drop trigger if exists availability_request_decided on public.availability_change_requests;
create trigger availability_request_decided
  after update of status on public.availability_change_requests
  for each row execute function public.availability_request_tells_the_asker();

-- A head deciding on a phone and a member watching on theirs are two
-- screens that need to agree.
do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'availability_change_requests'
  ) then
    alter publication supabase_realtime add table public.availability_change_requests;
  end if;
end $pub$;
