-- ============================================================================
-- Who made it
-- ============================================================================
--
-- The register already knew the model ("ATEM TV Studio 4K Pro") but not the
-- brand, which is the first thing anyone says out loud about a piece of kit
-- and the first thing they search for when replacing it. It also belongs on
-- the printed sticker, where "Blackmagic Design / ATEM TV Studio 4K Pro"
-- identifies the item to somebody who has never seen the register.
alter table public.inventory_items
  add column if not exists brand text;

comment on column public.inventory_items.brand is
  'Manufacturer or make, e.g. Sennheiser. The model column holds their product name.';
