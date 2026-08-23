-- ============================================================================
-- Message Board & Notifications (Sections 14-15)
-- ============================================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  visibility text not null default 'all',
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  reference_id uuid,
  read_boolean boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
create index notifications_user_unread_idx on public.notifications (user_id, read_boolean);

-- ---------------------------------------------------------------------------
-- FR14.3: a new message board post notifies every user. Runs as the
-- migration owner (implicit security context of a plain trigger function
-- with no RLS-restricted role), so it can fan out notification rows to all
-- profiles regardless of the posting user's own row visibility.
-- ---------------------------------------------------------------------------
create function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, reference_id)
  select id, 'message', new.id
  from public.profiles
  where id <> new.author_id;
  return new;
end;
$$;

create trigger messages_notify_on_insert
  after insert on public.messages
  for each row execute function public.notify_on_new_message();

-- ---------------------------------------------------------------------------
-- RLS: messages
-- ---------------------------------------------------------------------------
-- FR14.2: read permission = all logged-in users.
create policy messages_select on public.messages
  for select using (auth.uid() is not null);

-- FR14.1: post permission = Service Flow Coordinator, Department Head,
-- Admin. Assisting Heads cannot post (view + checklist-verification only,
-- Open Question 1 decision).
create policy messages_insert on public.messages
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1 from public.user_roles
        where user_id = auth.uid()
          and role_type in ('department_head', 'service_flow_coordinator')
      )
    )
  );

create policy messages_delete on public.messages
  for delete using (author_id = auth.uid() or public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- RLS: notifications — strictly own notifications, or Admin.
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- FR15.3: "mark all as read" — a user may only flip read_boolean on their
-- own notifications.
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy notifications_admin_insert on public.notifications
  for insert with check (public.is_admin(auth.uid()));

create policy notifications_admin_delete on public.notifications
  for delete using (public.is_admin(auth.uid()));
