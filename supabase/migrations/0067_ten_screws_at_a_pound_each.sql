-- ============================================================================
-- What one of it is
-- ============================================================================
--
-- "10 screws, £1" is ambiguous in the way that costs money: a pound for the
-- box or a pound for the screw? The register has always meant the second —
-- a consumable's value is its cost times how many there are — but nothing
-- on the page said so, and a number whose meaning has to be guessed is a
-- number that will be entered wrong.
--
-- So a line can say what one of it is: screws, boxes, metres, packs. It is
-- free text rather than a fixed list because a church stores things nobody
-- writing this could enumerate, and it is optional because most items are
-- just themselves.
--
-- The same field on a purchase request, so it survives the trip from "we
-- need more of these" to the shelf.

alter table public.inventory_items
  add column if not exists unit text
    check (unit is null or (length(btrim(unit)) > 0 and length(unit) <= 24));

alter table public.purchase_requests
  add column if not exists unit text
    check (unit is null or (length(btrim(unit)) > 0 and length(unit) <= 24));

comment on column public.inventory_items.unit is
  'What one of it is — "screw", "box", "metre". estimated_cost is the cost of one.';
comment on column public.purchase_requests.unit is
  'What one of it is. estimated_cost is the cost of one.';
