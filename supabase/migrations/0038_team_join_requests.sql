-- ============================================================================
-- Asking to join a team
-- ============================================================================
-- Someone who signs up belongs to nothing: their Teams page is empty, they
-- cannot post, and the only way in is for a head to already know they
-- exist. That makes the app useless on the day it matters — the day a new
-- volunteer wants to help.
--
-- So: everyone can see the teams that exist and ask to join one. The team's
-- head (or an Admin) decides, and decides *how* — core member or guest —
-- because those mean different things and the person asking cannot know
-- which they should be.
do $$
begin
  if to_regtype('public.join_request_status') is null then
    create type public.join_request_status as enum ('pending', 'approved', 'declined', 'withdrawn');
  end if;
end $$;

create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  status join_request_status not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references public.profiles(id) on delete set null,
  granted_type member_type
);

alter table public.team_join_requests enable row level security;

-- One open ask per person per team. Answered ones stay as history.
create unique index if not exists team_join_requests_one_pending
  on public.team_join_requests (user_id, department_id) where status = 'pending';

create index if not exists team_join_requests_department_idx
  on public.team_join_requests (department_id, status);

-- You see your own asks; a head sees the ones addressed to their team.
drop policy if exists team_join_requests_select on public.team_join_requests;
create policy team_join_requests_select on public.team_join_requests
  for select using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or public.is_dept_head(auth.uid(), department_id)
  );

-- ---------------------------------------------------------------------------
-- Asking
-- ---------------------------------------------------------------------------
create or replace function public.request_team_join(dept_id uuid, note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if not exists (select 1 from public.departments where id = dept_id) then
    raise exception 'That team no longer exists';
  end if;
  if exists (
    select 1 from public.department_members
    where user_id = auth.uid() and department_id = dept_id
  ) then
    raise exception 'You are already on that team';
  end if;
  if exists (
    select 1 from public.team_join_requests
    where user_id = auth.uid() and department_id = dept_id and status = 'pending'
  ) then
    raise exception 'You have already asked to join that team — the head has it';
  end if;

  insert into public.team_join_requests (user_id, department_id, note)
  values (auth.uid(), dept_id, note)
  returning id into new_id;

  -- Tell whoever can answer it: the team's head and assisting head.
  insert into public.notifications (user_id, type, reference_id)
  select ur.user_id, 'team_join_requested', new_id
  from public.user_roles ur
  where ur.department_id = dept_id
    and ur.role_type in ('department_head', 'assisting_head');

  return new_id;
end;
$$;

create or replace function public.withdraw_team_join(request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  request public.team_join_requests;
begin
  select * into request from public.team_join_requests where id = request_id;
  if request is null or request.status <> 'pending' then
    raise exception 'That request is no longer open';
  end if;
  if request.user_id <> auth.uid() then
    raise exception 'Only the person who asked can withdraw it';
  end if;

  update public.team_join_requests
  set status = 'withdrawn'::join_request_status, responded_at = now()
  where id = request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Answering
-- ---------------------------------------------------------------------------
-- Approving is also choosing what they join as: a core member is expected
-- to serve and counts toward the team's availability, a guest can see the
-- team's content without being on the hook for it.
create or replace function public.respond_team_join(
  request_id uuid,
  accept boolean,
  as_type member_type default 'core'
)
returns void language plpgsql security definer set search_path = public as $$
declare
  request public.team_join_requests;
begin
  select * into request from public.team_join_requests where id = request_id;
  if request is null or request.status <> 'pending' then
    raise exception 'That request is no longer open';
  end if;
  if not (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), request.department_id)
  ) then
    raise exception 'Only the team head can answer a request to join';
  end if;

  update public.team_join_requests
  set status = (case when accept then 'approved' else 'declined' end)::join_request_status,
      responded_at = now(),
      responded_by = auth.uid(),
      granted_type = case when accept then as_type end
  where id = request_id;

  if accept then
    insert into public.department_members (user_id, department_id, member_type)
    values (request.user_id, request.department_id, as_type)
    on conflict do nothing;
  end if;

  insert into public.notifications (user_id, type, reference_id)
  values (
    request.user_id,
    case when accept then 'team_join_approved' else 'team_join_declined' end,
    request_id
  );
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.request_team_join(uuid, text) to authenticated;
    grant execute on function public.withdraw_team_join(uuid) to authenticated;
    grant execute on function public.respond_team_join(uuid, boolean, member_type) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Posting on the board follows membership
-- ---------------------------------------------------------------------------
-- Being on a team is what earns a voice on the board: a volunteer posts as
-- their team, a head posts as the team they lead, an Admin posts for the
-- church. Someone on no team has nothing to speak for yet, which is now a
-- reason to join rather than a dead end.
drop policy if exists messages_insert on public.messages;

create policy messages_insert on public.messages
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_admin(auth.uid())
      or (
        department_id is not null
        and (
          public.is_dept_head(auth.uid(), department_id)
          or exists (
            select 1 from public.department_members dm
            where dm.user_id = auth.uid() and dm.department_id = messages.department_id
          )
        )
      )
    )
  );
