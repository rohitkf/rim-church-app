-- ============================================================================
-- Where a thing came from, its paperwork, and the things not bought yet
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The page you bought it on
-- ----------------------------------------------------------------------------
-- "Shure SM58" is a name; the listing is what you send somebody when they ask
-- for another one, or what you open to check the model before buying a spare.
alter table public.inventory_items
  add column if not exists product_url text
    check (product_url is null or product_url ~* '^https?://');

-- ----------------------------------------------------------------------------
-- Its paperwork
-- ----------------------------------------------------------------------------
-- An invoice lives in somebody's email and an insurance certificate lives in a
-- drawer, which means at the moment either is needed neither can be found.
-- Both kinds hang off the item, and either can be a link to where it already
-- lives or a file put here.
create table if not exists public.inventory_documents (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  kind text not null check (kind in ('invoice', 'insurance', 'warranty', 'other')),
  label text check (label is null or length(label) <= 160),
  -- Exactly one of the two: a link to where the document already is, or the
  -- path of a file in the inventory-docs bucket. A row with both would leave
  -- "open it" with two answers and no way to choose.
  link_url text check (link_url is null or link_url ~* '^https?://'),
  storage_path text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_documents_one_source
    check ((link_url is null) <> (storage_path is null))
);

create index if not exists inventory_documents_by_item on public.inventory_documents (item_id);

alter table public.inventory_documents enable row level security;

-- Read like the item itself: the inventory is visible to everyone signed in.
drop policy if exists inventory_documents_select on public.inventory_documents;
create policy inventory_documents_select on public.inventory_documents
  for select using (auth.uid() is not null);

drop policy if exists inventory_documents_write on public.inventory_documents;
create policy inventory_documents_write on public.inventory_documents
  for all
  using (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id))
  with check (public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id));

-- A private bucket, filed by team so the path itself says who owns the file —
-- the same trick the handbooks use.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-docs', 'inventory-docs', false, 20 * 1024 * 1024,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists inventory_docs_select on storage.objects;
create policy inventory_docs_select on storage.objects
  for select using (bucket_id = 'inventory-docs' and auth.uid() is not null);

drop policy if exists inventory_docs_insert on storage.objects;
create policy inventory_docs_insert on storage.objects
  for insert with check (
    bucket_id = 'inventory-docs'
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

drop policy if exists inventory_docs_delete on storage.objects;
create policy inventory_docs_delete on storage.objects
  for delete using (
    bucket_id = 'inventory-docs'
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

-- ----------------------------------------------------------------------------
-- The things not bought yet
-- ----------------------------------------------------------------------------
-- "We need another radio mic" is currently said in a corridor and remembered
-- by whoever heard it. A request is made by anyone on the team, decided by the
-- team's Head or an Admin, and — once it has actually been bought — becomes an
-- inventory item, so the wishlist and the shelf are the same list at two
-- points in time.
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  item_name text not null check (length(btrim(item_name)) > 0 and length(item_name) <= 160),
  quantity integer not null default 1 check (quantity > 0 and quantity <= 999),
  estimated_cost numeric(10, 2) check (estimated_cost is null or estimated_cost >= 0),
  product_url text check (product_url is null or product_url ~* '^https?://'),
  reason text check (reason is null or length(reason) <= 1000),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'purchased')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  -- What it became, once somebody bought it.
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchase_requests_by_department
  on public.purchase_requests (department_id, status);

alter table public.purchase_requests enable row level security;

-- The team sees its own list, its Head sees it, an Admin sees all of them.
-- Somebody who asked for something can always see what happened to it.
drop policy if exists purchase_requests_select on public.purchase_requests;
create policy purchase_requests_select on public.purchase_requests
  for select using (
    public.is_admin(auth.uid())
    or requested_by = auth.uid()
    or public.is_dept_member(auth.uid(), department_id)
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
  );

-- Anyone on the team can ask, in their own name, and it starts as a request
-- rather than as an approval of itself.
drop policy if exists purchase_requests_insert on public.purchase_requests;
create policy purchase_requests_insert on public.purchase_requests
  for insert with check (
    requested_by = auth.uid()
    and status = 'requested'
    and (
      public.is_admin(auth.uid())
      or public.is_dept_member(auth.uid(), department_id)
      or public.is_dept_head_or_assisting(auth.uid(), department_id)
    )
  );

-- Deciding is the Head's or an Admin's. The requester may still edit their own
-- while nobody has answered it — the trigger below is what stops them
-- approving it themselves.
drop policy if exists purchase_requests_update on public.purchase_requests;
create policy purchase_requests_update on public.purchase_requests
  for update using (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
    or (requested_by = auth.uid() and status = 'requested')
  )
  with check (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
    or (requested_by = auth.uid() and status = 'requested')
  );

drop policy if exists purchase_requests_delete on public.purchase_requests;
create policy purchase_requests_delete on public.purchase_requests
  for delete using (
    public.is_admin(auth.uid())
    or public.is_dept_head_or_assisting(auth.uid(), department_id)
    or (requested_by = auth.uid() and status = 'requested')
  );

create or replace function public.guard_purchase_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  may_decide boolean;
begin
  new.updated_at := now();
  -- Who asked, and when, are not the sort of thing an edit changes.
  new.requested_by := old.requested_by;
  new.department_id := old.department_id;
  new.created_at := old.created_at;

  if new.status is distinct from old.status then
    may_decide := public.is_admin(auth.uid())
      or public.is_dept_head_or_assisting(auth.uid(), old.department_id);
    if not may_decide then
      raise exception 'only an Admin or the team''s Head can decide a purchase request';
    end if;
    -- The decision is stamped here rather than trusted to the form, so the
    -- record of who said yes cannot be edited into somebody else's name.
    new.decided_by := auth.uid();
    new.decided_at := now();
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_requests_guard on public.purchase_requests;
create trigger purchase_requests_guard before update on public.purchase_requests
  for each row execute function public.guard_purchase_request();
