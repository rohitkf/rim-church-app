-- ============================================================================
-- The songs we sang
-- ============================================================================
--
-- A service's set list: what was sung, who led it, and where to find the
-- song. Everybody can read it — the whole church benefits from knowing
-- what is coming — and the worship team keeps it.
--
-- Who "the worship team" is has to be a fact about a department rather
-- than its name. `is_worship` follows the precedent already set by
-- `is_service_flow`: naming the team in a policy would break the first
-- time somebody renamed it to "Worship & Creative", and a policy that
-- fails on a rename is a policy that fails on a Sunday.
--
-- Who leads a song is chosen from that service's Worship rota rather than
-- typed, so the set list and the rota cannot disagree about who is even
-- in the building. It is nullable: a set list drafted on Tuesday, before
-- anybody is assigned, is a useful thing to have.

alter table public.departments
  add column if not exists is_worship boolean not null default false;

-- The team that exists today. A church that renames it keeps the flag;
-- one that has no team by this name sets it themselves.
update public.departments set is_worship = true
 where lower(btrim(name)) = 'worship' and not is_worship;

create unique index if not exists departments_one_worship_team
  on public.departments ((true)) where is_worship;

create table if not exists public.set_list_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  -- Whoever is singing it. From the service's rota, not typed.
  led_by uuid references public.profiles(id) on delete set null,
  -- Where to find it, and the words. Both optional, and a song is worth
  -- listing with neither.
  link text check (link is null or length(link) <= 2000),
  lyrics text check (lyrics is null or length(lyrics) <= 20000),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists set_list_items_service_idx
  on public.set_list_items (service_id, sort_order);

alter table public.set_list_items enable row level security;

/**
 * Whoever keeps the set list: an Admin, or anybody on the worship team.
 *
 * Deliberately the whole team rather than its Head. A set list is written
 * by whoever is leading that week, often on the day, and making the Head
 * the only person who can type a song title would put them on their phone
 * during the service.
 */
create or replace function public.can_edit_set_list(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(uid)
      or exists (
        select 1
        from public.department_members dm
        join public.departments d on d.id = dm.department_id
        where dm.user_id = uid and d.is_worship
      );
$$;

drop policy if exists set_list_items_select on public.set_list_items;
create policy set_list_items_select on public.set_list_items
  for select using (auth.uid() is not null);

drop policy if exists set_list_items_write on public.set_list_items;
create policy set_list_items_write on public.set_list_items
  for all
  using (public.can_edit_set_list(auth.uid()))
  with check (public.can_edit_set_list(auth.uid()));

-- Same shape as the other reorders: every song of the service, once each,
-- so a stale page cannot half-apply an order worked out before somebody
-- added a song.
create or replace function public.reorder_set_list(svc uuid, ids uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  i int;
begin
  if not public.can_edit_set_list(auth.uid()) then
    raise exception 'Only the worship team can change a set list';
  end if;
  if coalesce(array_length(ids, 1), 0) <> (
    select count(*) from public.set_list_items where service_id = svc
  ) then
    raise exception 'a reorder needs every song of the service, once each';
  end if;
  if coalesce(array_length(ids, 1), 0) = 0 then
    return;
  end if;

  for i in 1..array_length(ids, 1) loop
    update public.set_list_items
       set sort_order = i, updated_at = now()
     where id = ids[i] and service_id = svc;
    if not found then
      raise exception 'cannot reorder these songs';
    end if;
  end loop;
end;
$$;

revoke all on function public.reorder_set_list(uuid, uuid[]) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.reorder_set_list(uuid, uuid[]) to authenticated;
  end if;
end $$;
