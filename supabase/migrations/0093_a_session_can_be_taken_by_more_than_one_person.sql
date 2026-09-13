/*
 * More than one person can be on a session.
 *
 * A running order line held exactly one name, because `service_sessions`
 * carried the answer in its own two columns — `assigned_user_id` or
 * `guest_id`, never both, with a check constraint to make sure of it.
 * That is true of almost nothing that actually happens in a service.
 * Worship is a team. Communion is served by four people. A guest speaker
 * is introduced by somebody, and the planner could name one of the two.
 * Anyone wanting the second name put it in the session's title, which is
 * how a running order stops being data and becomes a note to self.
 *
 * So the answer moves off the session and into rows of its own. A session
 * has none, one, or as many assignees as it needs; each row is a member
 * or a guest, never both, and `order_index` keeps the order somebody
 * chose — the first name is still the first name.
 *
 * The old columns are not dropped here. The frontend that is deployed
 * right now reads them, and this migration runs before that deploy is
 * replaced; dropping them in the same breath would blank the running
 * order for the minutes in between. They are emptied of meaning by the
 * next migration, once the page reading these rows is live.
 */

create table if not exists public.service_session_assignees (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.service_sessions(id) on delete cascade,
  -- Somebody with an account, or somebody on the guest roll. Exactly one
  -- of the two: a row is a person, and a person is one or the other.
  user_id uuid references public.profiles(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete cascade,
  -- The order they were put on, which is the order the sheet prints.
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  constraint service_session_assignees_is_one_person
    check ((user_id is null) <> (guest_id is null))
);

comment on table public.service_session_assignees is
  'Who is taking a running-order session. One row per person, so a session can be shared.';

-- Nobody is on the same session twice. Two partial indexes rather than one
-- over both columns: a unique index treats nulls as distinct, so the plain
-- version would have let the same member be added again and again.
create unique index if not exists service_session_assignees_member_once
  on public.service_session_assignees (session_id, user_id) where user_id is not null;
create unique index if not exists service_session_assignees_guest_once
  on public.service_session_assignees (session_id, guest_id) where guest_id is not null;
create index if not exists service_session_assignees_session_idx
  on public.service_session_assignees (session_id, order_index);
create index if not exists service_session_assignees_user_idx
  on public.service_session_assignees (user_id) where user_id is not null;

alter table public.service_session_assignees enable row level security;

/*
 * Which service a session belongs to, for the policies below.
 *
 * `service_sessions` is behind RLS itself, so a policy that joined to it
 * would be asking a question the caller may not be allowed to ask. This
 * is the same lookup, done as the definer, exactly as the rest of the
 * permission helpers in this schema are.
 */
create or replace function public.session_service(sess_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select service_id from public.service_sessions where id = sess_id;
$$;

-- Who is on a session is as public as the running order it is part of.
drop policy if exists service_session_assignees_select on public.service_session_assignees;
create policy service_session_assignees_select on public.service_session_assignees
  for select using (auth.uid() is not null);

-- And as editable: the same rule the session itself carries, so the two
-- can never disagree about whether this service is still being planned.
drop policy if exists service_session_assignees_write on public.service_session_assignees;
create policy service_session_assignees_write on public.service_session_assignees
  for all
  using (
    public.is_admin(auth.uid())
    and not public.service_has_finished(public.session_service(session_id))
  )
  with check (
    public.is_admin(auth.uid())
    and not public.service_has_finished(public.session_service(session_id))
  );

-- Everything that was already assigned, carried over as the first name on
-- its session.
insert into public.service_session_assignees (session_id, user_id, guest_id, order_index)
select s.id, s.assigned_user_id, s.guest_id, 0
from public.service_sessions s
where (s.assigned_user_id is not null or s.guest_id is not null)
  and not exists (
    select 1 from public.service_session_assignees a where a.session_id = s.id
  );

/*
 * The feed still notices when a name changes.
 *
 * `activity_from_session` logs a 'planner' entry on every update to a
 * session, which used to include somebody being assigned. Now that the
 * names live elsewhere, adding or removing one would have been silent —
 * the one planner change most worth seeing in the feed.
 */
create or replace function public.activity_from_session_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare sess record;
begin
  select service_id, department_id, session_name
    into sess
    from public.service_sessions
   where id = coalesce(new.session_id, old.session_id);

  if not found then return coalesce(new, old); end if;

  perform public.record_activity(
    sess.service_id, sess.department_id, auth.uid(), 'planner', sess.session_name, 'changed'
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists activity_session_assignee on public.service_session_assignees;
create trigger activity_session_assignee
  after insert or delete on public.service_session_assignees
  for each row execute function public.activity_from_session_assignee();

-- The planner is watched live; a name going on a session is exactly the
-- kind of change other screens must not miss.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'service_session_assignees'
  ) then
    alter publication supabase_realtime add table public.service_session_assignees;
  end if;
end $$;
