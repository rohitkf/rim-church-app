-- ============================================================================
-- Categories: shelves for a team's inventory
-- ============================================================================
-- A team's inventory is one flat list, which is fine at four items and
-- useless at forty. Media alone runs cameras, cables, audio, storage and
-- stands, and finding the memory cards means reading past all of it.
--
-- So a team may name its own shelves and put items on them. Categories
-- belong to a department rather than to the church: what Media needs to
-- separate is not what Hospitality needs, and a shared list would fill up
-- with everybody else's words.
--
-- An item's category is optional and stays optional. Nothing is migrated
-- onto a shelf, no team is made to sort anything, and an item with no
-- category is not an error — it just reads under its own heading at the
-- bottom of the page.

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  name text not null,
  -- Hand-ordered, like a team's roles: a shelf order is a judgement about
  -- what matters, not something to be sorted alphabetically.
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One shelf of a given name per team. Two "Cables" is a mistake every
  -- time, and the constraint says so at the moment it is made.
  unique (department_id, name)
);

alter table public.inventory_categories enable row level security;

create trigger inventory_categories_touch_updated_at
  before update on public.inventory_categories
  for each row execute function public.touch_updated_at();

-- Seen by whoever can see the team's inventory, since a category is only a
-- heading over it.
create policy inventory_categories_select on public.inventory_categories
  for select using (public.can_view_department_content(auth.uid(), department_id));

-- Named and reordered by whoever runs the team, which is the same rule the
-- items themselves already use. `is_dept_head` covers the Assisting Head.
create policy inventory_categories_write on public.inventory_categories
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

-- `on delete set null`, so deleting a heading never deletes what was filed
-- under it. Losing a shelf must not lose the equipment: the items simply
-- fall back to being uncategorised.
alter table public.inventory_items
  add column category_id uuid references public.inventory_categories(id) on delete set null;

create index inventory_items_category_id_idx
  on public.inventory_items (category_id);

-- The reset lists in 0021/0037/0051 name the tables they empty. Categories
-- are a team's own arrangement rather than a service's record, so they are
-- deliberately not added there: an owner clearing a season's data should
-- not have to rebuild the shelves.
