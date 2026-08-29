-- ============================================================================
-- Polls on a team's board
-- ============================================================================
--
-- A team board answers "what is happening"; a poll answers "who is in".
-- It lives beside the team's messages and follows exactly the same reading
-- rule — the team, whoever leads it, and Admin — because a poll aimed at
-- one team is as private as anything else said in that room.
--
-- Two things it has to get right, both enforced here rather than in the
-- page: a single-choice poll means one answer, and a deadline means the
-- answers stop changing when it passes. A button that hides itself is a
-- courtesy; the rule is the policy.

create table if not exists public.team_polls (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null check (length(btrim(question)) > 0 and length(question) <= 300),
  -- 'single': one answer, picking another moves it. 'multiple': any number.
  choice_mode text not null default 'single' check (choice_mode in ('single', 'multiple')),
  -- When answers freeze. Null means the poll stays open indefinitely.
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.team_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.team_polls(id) on delete cascade,
  label text not null check (length(btrim(label)) > 0 and length(label) <= 120),
  sort_order integer not null default 0
);

create table if not exists public.team_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.team_polls(id) on delete cascade,
  option_id uuid not null references public.team_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One person answers one option once; picking it again is unpicking.
  unique (option_id, user_id)
);

create index if not exists team_polls_department_idx
  on public.team_polls (department_id, created_at desc);
create index if not exists team_poll_options_poll_idx
  on public.team_poll_options (poll_id, sort_order);
create index if not exists team_poll_votes_poll_idx
  on public.team_poll_votes (poll_id);

alter table public.team_polls enable row level security;
alter table public.team_poll_options enable row level security;
alter table public.team_poll_votes enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Which team a poll belongs to. SECURITY DEFINER so the options and votes
-- policies can ask about a poll row the caller may not read directly.
create or replace function public.poll_department(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select department_id from public.team_polls where id = p_id;
$$;

-- Whether the poll is still taking answers. A poll with no deadline is
-- always open; one with a deadline closes the moment it passes.
create or replace function public.poll_is_open(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(closes_at > now(), true) from public.team_polls where id = p_id;
$$;

-- The same reading rule the team's messages use.
create or replace function public.may_read_team(dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid())
      or public.is_dept_member(auth.uid(), dept_id)
      or public.is_dept_head_or_assisting(auth.uid(), dept_id);
$$;

-- ---------------------------------------------------------------------------
-- Who may see, ask and answer
-- ---------------------------------------------------------------------------
-- Everyone in the room sees the poll and the answers: a poll whose results
-- only the asker can see is a survey, not a team deciding something.
drop policy if exists team_polls_select on public.team_polls;
create policy team_polls_select on public.team_polls
  for select to authenticated using (public.may_read_team(department_id));

-- Asking is a leadership act, like an alert: heads, assisting heads, Admin.
drop policy if exists team_polls_write on public.team_polls;
create policy team_polls_write on public.team_polls
  for all to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
  );

drop policy if exists team_poll_options_select on public.team_poll_options;
create policy team_poll_options_select on public.team_poll_options
  for select to authenticated
  using (public.may_read_team(public.poll_department(poll_id)));

drop policy if exists team_poll_options_write on public.team_poll_options;
create policy team_poll_options_write on public.team_poll_options
  for all to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), public.poll_department(poll_id))
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), public.poll_department(poll_id))
  );

drop policy if exists team_poll_votes_select on public.team_poll_votes;
create policy team_poll_votes_select on public.team_poll_votes
  for select to authenticated
  using (public.may_read_team(public.poll_department(poll_id)));

-- You answer for yourself, in a room you belong to, while it is open.
drop policy if exists team_poll_votes_insert on public.team_poll_votes;
create policy team_poll_votes_insert on public.team_poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.may_read_team(public.poll_department(poll_id))
    and public.poll_is_open(poll_id)
  );

-- Unpicking is subject to the deadline too — otherwise "you cannot change
-- your answer" would still let you withdraw it.
drop policy if exists team_poll_votes_delete on public.team_poll_votes;
create policy team_poll_votes_delete on public.team_poll_votes
  for delete to authenticated
  using (user_id = auth.uid() and public.poll_is_open(poll_id));

-- ---------------------------------------------------------------------------
-- Single choice means single
-- ---------------------------------------------------------------------------
-- Rather than rejecting the second answer, the newer one wins and the older
-- goes: that is what picking a different option in a single-choice poll
-- means, and it saves the page a delete-then-insert round trip it could
-- fail halfway through.
create or replace function public.enforce_single_choice_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select choice_mode from public.team_polls where id = new.poll_id) = 'single' then
    delete from public.team_poll_votes
     where poll_id = new.poll_id
       and user_id = new.user_id
       and option_id <> new.option_id;
  end if;
  return new;
end;
$$;

drop trigger if exists team_poll_votes_single_choice on public.team_poll_votes;
create trigger team_poll_votes_single_choice
  before insert on public.team_poll_votes
  for each row execute function public.enforce_single_choice_vote();

-- The board updates itself while people answer.
alter publication supabase_realtime add table public.team_polls;
alter publication supabase_realtime add table public.team_poll_options;
alter publication supabase_realtime add table public.team_poll_votes;
