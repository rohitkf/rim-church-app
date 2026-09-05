-- ============================================================================
-- The first time somebody opens the app
-- ============================================================================
-- A new volunteer's first sight of this app is a countdown to a Sunday they
-- have not been rostered for, on a dashboard whose other panels have gone
-- quiet because they are on no team yet (0080). Nothing is wrong with that
-- page except that it explains nothing: what this is, what it will ask of
-- them, and the single thing they have to do to be part of it.
--
-- So there is a welcome, shown once. This column is what "once" means.
--
-- A timestamp rather than a flag, because "when did this person first
-- arrive" is worth knowing later and a boolean throws it away.
--
-- Everyone who already has an account is marked as welcomed here. They
-- have been using the app for weeks; a tour of it now would be a bug
-- wearing a party hat.
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists welcomed_at timestamptz;

comment on column public.profiles.welcomed_at is
  'When the welcome was shown and dismissed. Null means it has not been.';

-- Backfill: everybody who exists now has already arrived.
update public.profiles set welcomed_at = now() where welcomed_at is null;

-- No policy change. A profile is already updatable by the person it
-- belongs to (0002), which is exactly who marks this.
