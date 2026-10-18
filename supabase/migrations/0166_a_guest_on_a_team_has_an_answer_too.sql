/*
 * A guest on a team has an answer too.
 *
 * Since 0161 a team can list somebody with no account — Steve, who helps
 * Worship now and then and has never signed up. The Availability page
 * reads `availability`, which is keyed by an account, so he was not on it
 * at all: his Head could not say he is coming, and could not see that
 * anybody had.
 *
 * So the roll's people get their own answers, `guest_availability`, beside
 * the account holders' rather than in the same table (0161 gives the
 * reason: everything that counts a team counts accounts — reminders,
 * readiness, the late-answer asks, the rota's dropout — and a guest has
 * nobody to remind or ask). Nobody answers for themselves here; whoever
 * may answer for others on that team does, by the same rules as anybody
 * else's answer:
 *
 *   · giving or taking away an answer — "avail.add_others"
 *   · changing one already given      — "avail.edit_others"
 *   · reading how it changed          — "avail.history"
 *
 * Each answer keeps a log beside it, written by a trigger as 0145's is,
 * and a finished service's answers stand as they are (0047).
 *
 * When the guest is taken off the team, their answers for it go. When
 * they sign up and are linked (0161's `guest_joined_moves_teams`), the
 * answers for services still to come move across to their account with
 * their teams.
 */

create table if not exists public.guest_availability (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  status public.availability_status not null,
  note text constraint guest_availability_note_is_a_note check (length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guest_id, service_id, department_id)
);

comment on table public.guest_availability is
  'Answers for the guest roll''s people on a team (0161), given for them by whoever may answer for others.';

create index if not exists guest_availability_service_department_idx
  on public.guest_availability (service_id, department_id);

drop trigger if exists guest_availability_touch_updated_at on public.guest_availability;
create trigger guest_availability_touch_updated_at
  before update on public.guest_availability
  for each row execute function public.touch_updated_at();

alter table public.guest_availability enable row level security;

-- Read by whoever reads the team's answers (0014): the team, its Heads,
-- Admins, and the coordinator planning that service.
drop policy if exists guest_availability_select on public.guest_availability;
create policy guest_availability_select on public.guest_availability
  for select using (
    public.can_view_department_content(auth.uid(), department_id)
    or public.is_service_coordinator(auth.uid(), service_id)
  );

drop policy if exists guest_availability_insert on public.guest_availability;
create policy guest_availability_insert on public.guest_availability
  for insert with check (
    not public.service_has_finished(service_id)
    and public.may(auth.uid(), 'avail.add_others', department_id, service_id)
    and exists (
      select 1 from public.department_guests dg
      where dg.guest_id = guest_availability.guest_id
        and dg.department_id = guest_availability.department_id
    )
  );

drop policy if exists guest_availability_update on public.guest_availability;
create policy guest_availability_update on public.guest_availability
  for update using (public.may(auth.uid(), 'avail.edit_others', department_id, service_id))
  with check (public.may(auth.uid(), 'avail.edit_others', department_id, service_id));

drop policy if exists guest_availability_delete on public.guest_availability;
create policy guest_availability_delete on public.guest_availability
  for delete using (
    not public.service_has_finished(service_id)
    and public.may(auth.uid(), 'avail.add_others', department_id, service_id)
  );

-- An answer stays with its guest, team and service, and a finished
-- service's answers stand.
create or replace function public.guard_guest_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.guest_id is distinct from old.guest_id
     or new.service_id is distinct from old.service_id
     or new.department_id is distinct from old.department_id then
    raise exception 'An availability answer cannot be moved to another person or service';
  end if;
  if new.status is distinct from old.status and public.service_has_finished(new.service_id) then
    raise exception 'That service has finished — availability can no longer be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_guest_availability on public.guest_availability;
create trigger guard_guest_availability
  before update on public.guest_availability
  for each row execute function public.guard_guest_availability();

/*
 * The log, as 0145's: one line each time the answer is given, changed,
 * has its note rewritten, or is taken away. Written by the trigger only.
 */
create table if not exists public.guest_availability_history (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  kind text not null check (kind in ('answered', 'changed', 'note', 'removed')),
  status public.availability_status,
  previous_status public.availability_status,
  note text,
  changed_by uuid references public.profiles(id) on delete set null,
  after_close boolean,
  changed_at timestamptz not null default now(),
  constraint guest_availability_history_says_something
    check ((kind = 'removed') = (status is null))
);

comment on table public.guest_availability_history is
  'Every time a guest''s availability answer was given, changed or removed, and by whom. Written by a trigger only.';

create index if not exists guest_availability_history_answer_idx
  on public.guest_availability_history (service_id, department_id, guest_id, changed_at);

alter table public.guest_availability_history enable row level security;
revoke insert, update, delete, truncate on public.guest_availability_history from anon, authenticated;

drop policy if exists guest_availability_history_select on public.guest_availability_history;
create policy guest_availability_history_select on public.guest_availability_history
  for select using (public.may(auth.uid(), 'avail.history', department_id, service_id));

create or replace function public.guest_availability_history_from_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  what text;
  said_before text := case when tg_op = 'INSERT' then null else nullif(btrim(coalesce(old.note, '')), '') end;
  says_now text := case when tg_op = 'DELETE' then null else nullif(btrim(coalesce(new.note, '')), '') end;
begin
  if tg_op = 'INSERT' then
    what := 'answered';
  elsif tg_op = 'DELETE' then
    what := 'removed';
  elsif new.status is distinct from old.status then
    what := 'changed';
  elsif says_now is distinct from said_before then
    what := 'note';
  else
    return null;
  end if;

  insert into public.guest_availability_history (
    guest_id, service_id, department_id, kind, status, previous_status, note, changed_by, after_close
  )
  select
    row_now.guest_id,
    row_now.service_id,
    row_now.department_id,
    what,
    case when tg_op = 'DELETE' then null else new.status end,
    case when tg_op = 'INSERT' then null else old.status end,
    says_now,
    (select p.id from public.profiles p where p.id = auth.uid()),
    public.availability_is_closed(row_now.service_id)
  -- Going with its service, team or guest: the line would point at
  -- something that has just stopped existing (0145).
  where exists (select 1 from public.services s where s.id = row_now.service_id)
    and exists (select 1 from public.departments d where d.id = row_now.department_id)
    and exists (select 1 from public.guests g where g.id = row_now.guest_id);

  return null;
end;
$$;

drop trigger if exists guest_availability_history on public.guest_availability;
create trigger guest_availability_history
  after insert or update or delete on public.guest_availability
  for each row execute function public.guest_availability_history_from_answer();

-- Taken off the team, their answers for it go with them.
create or replace function public.department_guest_gone_takes_answers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.guest_availability
  where guest_id = old.guest_id and department_id = old.department_id;
  return old;
end;
$$;

drop trigger if exists department_guest_gone_takes_answers on public.department_guests;
create trigger department_guest_gone_takes_answers
  after delete on public.department_guests
  for each row execute function public.department_guest_gone_takes_answers();

/*
 * 0161's sign-up move, which now brings the answers too: those for
 * services still to come become answers on the account (one already given
 * there is kept), and the guest's go.
 */
create or replace function public.guest_joined_moves_teams()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.became_member is null and new.became_member is not null then
    insert into public.department_members (department_id, user_id, member_type)
    select dg.department_id, new.became_member, dg.member_type
    from public.department_guests dg
    where dg.guest_id = new.id
    on conflict (department_id, user_id) do nothing;

    insert into public.availability (user_id, service_id, department_id, status, note)
    select new.became_member, ga.service_id, ga.department_id, ga.status, ga.note
    from public.guest_availability ga
    where ga.guest_id = new.id
      and not public.service_has_finished(ga.service_id)
    on conflict (user_id, service_id, department_id) do nothing;

    delete from public.guest_availability where guest_id = new.id;
    delete from public.department_guests where guest_id = new.id;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
