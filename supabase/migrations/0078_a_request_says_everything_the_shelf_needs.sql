-- ============================================================================
-- A request should say everything the shelf will need
-- ============================================================================
-- Approving a purchase request turns it into an inventory item, and until
-- now most of that item arrived empty. A request could carry a name, a
-- count, a unit, a cost, a link and a reason — so the brand, model, serial
-- number, where it lives and what kind of thing it is all had to be typed
-- again, by somebody who was not in the room when it was asked for and had
-- to go and find out.
--
-- Worse, `kind` was guessed: the code read "more than one of them" as
-- "consumable", which makes three identical cameras a consumable and one
-- box of screws an asset. It is a question with two answers and it was
-- never asked.
--
-- So the request form now mirrors the add-item form, and these are the
-- columns that were missing. Every one is optional: asking for something
-- should not become a form somebody gives up on, and a blank here is no
-- worse than the blank it replaces.

alter table public.purchase_requests
  -- Asset or consumable. Asked rather than inferred from the count.
  add column if not exists kind text
    check (kind is null or kind in ('asset', 'consumable')),
  add column if not exists brand text
    check (brand is null or length(brand) <= 120),
  add column if not exists model text
    check (model is null or length(model) <= 160),
  add column if not exists serial_number text
    check (serial_number is null or length(serial_number) <= 120),
  add column if not exists location text
    check (location is null or length(location) <= 160),
  -- The word the asset tag is minted from — three letters of it become the
  -- middle of MED-MEM-0001. Named `category` to match the column it will be
  -- copied into, confusing as that word now is on this table.
  add column if not exists category text
    check (category is null or length(category) <= 80),
  -- The shelf it should be filed on once it exists. `on delete set null`,
  -- so deleting a category never deletes the request that pointed at it.
  add column if not exists category_id uuid
    references public.inventory_categories(id) on delete set null,
  -- When to reorder, for something bought by the box.
  add column if not exists reorder_level integer
    check (reorder_level is null or reorder_level >= 0);

comment on column public.purchase_requests.kind is
  'Asset or consumable, asked at request time rather than guessed from quantity.';
comment on column public.purchase_requests.category is
  'The tag word, not the shelf. Three letters of it become the middle of the asset tag.';
comment on column public.purchase_requests.category_id is
  'The shelf to file it on once the request becomes an item.';
