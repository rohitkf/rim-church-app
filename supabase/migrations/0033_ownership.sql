-- ============================================================================
-- One owner, and how it moves
-- ============================================================================
-- Admin is a job several people can hold. Ownership is a different thing:
-- the single account that decides who else is an Admin, and the one that
-- cannot be locked out by another Admin having a bad day. Exactly one
-- account holds it, and it moves only by the holder offering it and the
-- other person accepting — never by one person taking it.
--
-- It lives in its own table rather than as another role_type, so "exactly
-- one" is a primary key rather than a rule someone has to remember.
create table if not exists public.app_owner (
  only_row boolean primary key default true check (only_row),
  user_id uuid not null references public.profiles(id) on delete restrict,
  since timestamptz not null default now()
);

alter table public.app_owner enable row level security;

-- Everyone can see who the owner is; nobody writes this table directly.
drop policy if exists app_owner_select on public.app_owner;
create policy app_owner_select on public.app_owner
  for select using (auth.uid() is not null);

create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_owner where user_id = uid);
$$;

-- Until someone claims it, the longest-standing Admin holds it, so an
-- existing church doesn't wake up with nobody able to grant anything.
insert into public.app_owner (user_id)
select user_id from public.user_roles
where role_type = 'admin'
order by created_at
limit 1
on conflict (only_row) do nothing;

-- ---------------------------------------------------------------------------
-- A grant should exist once
-- ---------------------------------------------------------------------------
-- The original unique constraint covers (user_id, role_type, department_id,
-- service_id), and in SQL two NULLs are not equal — so an app-wide grant
-- like Admin, whose department and service are both NULL, could be inserted
-- over and over. Harmless until you revoke it and find another copy behind
-- it. Dedupe, then make the church-wide grants unique for real.
delete from public.user_roles a
using public.user_roles b
where a.department_id is null
  and a.service_id is null
  and b.department_id is null
  and b.service_id is null
  and a.user_id = b.user_id
  and a.role_type = b.role_type
  and a.ctid > b.ctid;

create unique index if not exists user_roles_one_global_grant
  on public.user_roles (user_id, role_type)
  where department_id is null and service_id is null;

-- ---------------------------------------------------------------------------
-- Who may take Admin away
-- ---------------------------------------------------------------------------
-- Any Admin may hand Admin out — that is ordinary delegation. Taking it
-- away is not: an Admin removing another Admin is how a disagreement turns
-- into a lockout. So a grant can be removed by the owner, or by the person
-- giving up their own, and the owner's own Admin cannot be removed at all.
create or replace function public.user_roles_guard_admin_removal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role_type <> 'admin' then
    return old;
  end if;
  -- No session behind the change: a cascade, a scheduled job, a migration.
  -- Those are not one Admin acting against another.
  if auth.uid() is null then
    return old;
  end if;
  if public.is_super_admin(old.user_id) then
    raise exception 'The owner''s Admin access cannot be removed — transfer ownership first';
  end if;
  if public.is_super_admin(auth.uid()) or old.user_id = auth.uid() then
    return old;
  end if;
  raise exception 'Only the owner can remove another Admin';
end;
$$;

drop trigger if exists user_roles_guard_admin_removal on public.user_roles;
create trigger user_roles_guard_admin_removal
  before delete on public.user_roles
  for each row execute function public.user_roles_guard_admin_removal();

-- ---------------------------------------------------------------------------
-- Handing it over
-- ---------------------------------------------------------------------------
create table if not exists public.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table public.ownership_transfers enable row level security;

-- One offer outstanding at a time: two pending offers would let ownership
-- land in two places depending on who clicked first.
create unique index if not exists ownership_transfers_one_pending
  on public.ownership_transfers ((true)) where status = 'pending';

drop policy if exists ownership_transfers_select on public.ownership_transfers;
create policy ownership_transfers_select on public.ownership_transfers
  for select using (
    auth.uid() in (from_user, to_user) or public.is_admin(auth.uid())
  );

create or replace function public.request_ownership_transfer(target uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can offer ownership';
  end if;
  if target = auth.uid() then
    raise exception 'You already own this';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'That person does not have an account';
  end if;
  if exists (select 1 from public.ownership_transfers where status = 'pending') then
    raise exception 'There is already an offer outstanding — cancel it first';
  end if;

  insert into public.ownership_transfers (from_user, to_user)
  values (auth.uid(), target)
  returning id into new_id;

  insert into public.notifications (user_id, type, reference_id)
  values (target, 'ownership_offered', new_id);

  return new_id;
end;
$$;

create or replace function public.cancel_ownership_transfer(transfer_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  transfer public.ownership_transfers;
begin
  select * into transfer from public.ownership_transfers where id = transfer_id;
  if transfer is null or transfer.status <> 'pending' then
    raise exception 'That offer is no longer open';
  end if;
  if auth.uid() <> transfer.from_user then
    raise exception 'Only the person who made the offer can withdraw it';
  end if;

  update public.ownership_transfers
  set status = 'cancelled', responded_at = now()
  where id = transfer_id;
end;
$$;

-- Accepting is the only way ownership moves. The outgoing owner keeps
-- Admin — losing the church's records because you handed the keys over
-- would be its own kind of failure.
create or replace function public.respond_ownership_transfer(transfer_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  transfer public.ownership_transfers;
begin
  select * into transfer from public.ownership_transfers where id = transfer_id;
  if transfer is null or transfer.status <> 'pending' then
    raise exception 'That offer is no longer open';
  end if;
  if auth.uid() <> transfer.to_user then
    raise exception 'Only the person it was offered to can answer it';
  end if;

  update public.ownership_transfers
  set status = case when accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = transfer_id;

  if not accept then
    insert into public.notifications (user_id, type, reference_id)
    values (transfer.from_user, 'ownership_declined', transfer_id);
    return;
  end if;

  update public.app_owner set user_id = transfer.to_user, since = now();

  -- Both ends hold Admin afterwards: the new owner needs it, and the old
  -- one keeps the access their work depends on.
  insert into public.user_roles (user_id, role_type)
  values (transfer.to_user, 'admin')
  on conflict (user_id, role_type, department_id, service_id) do nothing;

  insert into public.user_roles (user_id, role_type)
  values (transfer.from_user, 'admin')
  on conflict (user_id, role_type, department_id, service_id) do nothing;

  insert into public.notifications (user_id, type, reference_id)
  values (transfer.from_user, 'ownership_accepted', transfer_id);
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.is_super_admin(uuid) to authenticated;
    grant execute on function public.request_ownership_transfer(uuid) to authenticated;
    grant execute on function public.cancel_ownership_transfer(uuid) to authenticated;
    grant execute on function public.respond_ownership_transfer(uuid, boolean) to authenticated;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- Deleting an account is removing an Admin, when the account is an Admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can remove someone';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;
  if public.is_super_admin(target_user_id) then
    raise exception 'The owner''s account cannot be removed — transfer ownership first';
  end if;
  if public.is_admin(target_user_id) and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can remove another Admin''s account';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.admin_delete_user(uuid) to authenticated;
  end if;
end $$;
