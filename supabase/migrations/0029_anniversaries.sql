-- ============================================================================
-- Wedding anniversaries
-- ============================================================================
-- Birthdays were already on the profile; a wedding anniversary is the other
-- date a church wants to mark, and it belongs beside it rather than in the
-- compliance table: the Celebrations page is for everyone to see, the same
-- way everyone can already see a birthday.
alter table public.profiles add column if not exists anniversary date;

comment on column public.profiles.anniversary is
  'Wedding anniversary. Visible to every signed-in user, like dob.';
