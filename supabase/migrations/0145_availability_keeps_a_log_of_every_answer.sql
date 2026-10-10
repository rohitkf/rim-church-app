/*
 * Availability keeps a log of every answer it was given.
 *
 * The tracker shows what somebody says now. It cannot show that they said
 * yes on Monday, no at 23:40 on Saturday and maybe on Sunday morning —
 * and that is the thing an Admin planning a rota needs to know about a
 * person, more than any single answer. The row is overwritten each time,
 * and the activity feed, which does hear every change, clears each week
 * and says it as a sentence about a service, not as a record about a
 * person.
 *
 * So each answer now has a history beside it: one line every time it is
 * given, changed, has its note rewritten, or is taken away — what it said,
 * what it said before, who did it, when, and whether the window had shut.
 *
 * **Written by a trigger, never by the app.** As with the feed (0041): a
 * log the app writes is a log the app can leave a gap in. Nobody has an
 * insert, update or delete policy, so nobody can tidy their own record.
 *
 * **Seen by whoever the church says** — Settings › Access & privileges,
 * "See the history of somebody's answers" (`avail.history`). Out of the box
 * that is the Owner and Admins, and nobody else; a Head can be given their
 * own team's, and anybody their own.
 *
 * **It goes with the answer.** The history is about one person's answer
 * for one team at one service, so it is deleted with that service (0128's
 * clock), that team or that person, like the answer itself. While one of
 * those is being deleted, the answers going with it write nothing — the
 * line would point at something that has just stopped existing (0085).
 *
 * **It starts now.** Nothing before this migration was kept, so every
 * answer already given gets one line saying what it was when the log
 * began, timed at the row's last change — true, because it has not moved
 * since — and marked as such, so it is never read as the moment it was
 * given.
 */

create table if not exists public.availability_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  -- answered: the first answer · changed: a different status · note: only
  -- the note moved · removed: the answer was taken away · before_log: what
  -- it already said when this log began.
  kind text not null
    check (kind in ('answered', 'changed', 'note', 'removed', 'before_log')),
  -- What it said afterwards. Nothing, once it has been taken away.
  status public.availability_status,
  -- What it said before. Nothing, for a first answer.
  previous_status public.availability_status,
  note text,
  -- Who did it: the person themselves, or somebody on their behalf. Null
  -- when that account has since gone, or nobody signed in did it.
  changed_by uuid references public.profiles(id) on delete set null,
  -- Applied by a Head's yes to the person's own late ask (0095).
  by_request boolean not null default false,
  -- Whether answers for that service had already closed. Unknown for the
  -- lines written when the log began.
  after_close boolean,
  changed_at timestamptz not null default now(),
  constraint availability_history_says_something
    check ((kind = 'removed') = (status is null))
);

comment on table public.availability_history is
  'Every time an availability answer was given, changed or removed: what it said, who did it, and when. Written by a trigger only.';

create index if not exists availability_history_answer_idx
  on public.availability_history (service_id, department_id, user_id, changed_at);

create index if not exists availability_history_person_idx
  on public.availability_history (user_id, changed_at);

alter table public.availability_history enable row level security;

-- Reading is the grid's to say; writing is nobody's.
revoke insert, update, delete, truncate on public.availability_history from anon, authenticated;

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('avail.history', 'admin', '{none,all}', 'all'),
  ('avail.history', 'head', '{none,own,team,all}', 'none'),
  ('avail.history', 'coordinator', '{none}', 'none'),
  ('avail.history', 'member', '{none,own,team,all}', 'none'),
  ('avail.history', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

drop policy if exists availability_history_select on public.availability_history;
create policy availability_history_select on public.availability_history
  for select using (
    public.may(auth.uid(), 'avail.history', department_id, service_id, user_id)
  );

/*
 * Whether this write to somebody's answer is a Head's yes to their own
 * late ask.
 *
 * The approval (below) names its request while it writes; this checks the
 * name against a real, approved request for exactly this answer, so the
 * flag means nothing set anywhere else.
 */
create or replace function public.availability_write_is_approval(
  person uuid,
  svc uuid,
  dept uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (
    select 1 from public.availability_change_requests r
    where r.id::text = coalesce(current_setting('rim.availability_request', true), '')
      and r.status = 'approved'
      and r.user_id = person
      and r.service_id = svc
      and r.department_id = dept
  );
$function$;

revoke all on function public.availability_write_is_approval(uuid, uuid, uuid) from public, anon, authenticated;

/*
 * One line per thing the person said.
 *
 * Marking who turned up is the same row but not the person's answer, so it
 * writes nothing here; re-tapping the answer already given is no change.
 */
create or replace function public.availability_history_from_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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

  insert into public.availability_history (
    user_id, service_id, department_id, kind, status, previous_status, note,
    changed_by, by_request, after_close
  )
  select
    row_now.user_id,
    row_now.service_id,
    row_now.department_id,
    what,
    case when tg_op = 'DELETE' then null else new.status end,
    case when tg_op = 'INSERT' then null else old.status end,
    says_now,
    (select p.id from public.profiles p where p.id = auth.uid()),
    public.availability_write_is_approval(row_now.user_id, row_now.service_id, row_now.department_id),
    public.availability_is_closed(row_now.service_id)
  -- The service, team or person is being deleted, and the answer with it:
  -- the line would be refused by its foreign key, and would go a moment
  -- later anyway.
  where exists (select 1 from public.services s where s.id = row_now.service_id)
    and exists (select 1 from public.departments d where d.id = row_now.department_id)
    and exists (select 1 from public.profiles p where p.id = row_now.user_id);

  return null;
end;
$function$;

drop trigger if exists availability_history on public.availability;
create trigger availability_history
  after insert or update or delete on public.availability
  for each row execute function public.availability_history_from_answer();

/*
 * 0095's approval, unchanged except that it says so while it writes.
 *
 * The answer it writes is the Head's doing in the log (they are who is
 * signed in), and without this it reads as the Head overruling somebody.
 * The flag lasts only for the one write.
 */
create or replace function public.availability_request_applies_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.status <> 'approved' or old.status = 'approved' then return new; end if;

  perform set_config('rim.availability_request', new.id::text, true);

  insert into public.availability (user_id, service_id, department_id, status, note)
  values (new.user_id, new.service_id, new.department_id, new.requested_status, new.reason)
  on conflict (user_id, service_id, department_id)
  do update set status = excluded.status, note = coalesce(excluded.note, availability.note);

  perform set_config('rim.availability_request', '', true);

  return new;
end;
$function$;

-- What every answer already said when the log began. Only answers with no
-- history yet, so running this twice adds nothing.
insert into public.availability_history (
  user_id, service_id, department_id, kind, status, note, changed_at
)
select
  a.user_id, a.service_id, a.department_id, 'before_log', a.status,
  nullif(btrim(coalesce(a.note, '')), ''), a.updated_at
from public.availability a
where not exists (
  select 1 from public.availability_history h
  where h.user_id = a.user_id
    and h.service_id = a.service_id
    and h.department_id = a.department_id
);

notify pgrst, 'reload schema';
