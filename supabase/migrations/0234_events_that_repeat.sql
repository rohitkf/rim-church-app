-- Events that repeat: weekly, every two weeks, monthly, yearly.
--
-- Each occurrence is its own row, as every other event is, so the diary,
-- search, today's banner and the 60-day tidy-up (0219) need nothing new:
-- a weekly prayer meeting is simply there on each of its days, and the
-- ones that have passed go the way past events go. What joins them is
-- series_id, so changing or removing one can be "this one" or "this and
-- every one after it"; repeat_rule says how it repeats, for the words
-- "Every week on Sunday" beside it.
--
-- The rows are made by the app in one insert, under the same rules as
-- adding one event (church_events' own policies), so nobody can make a
-- series they could not make one of.

alter table public.church_events
  add column if not exists series_id uuid,
  add column if not exists repeat_rule text;

alter table public.church_events
  drop constraint if exists church_events_repeat_rule_is_known;
alter table public.church_events
  add constraint church_events_repeat_rule_is_known
  check (repeat_rule is null or repeat_rule in ('weekly', 'fortnightly', 'monthly_date', 'monthly_weekday', 'yearly'));

create index if not exists church_events_series_idx on public.church_events (series_id, event_date)
  where series_id is not null;

notify pgrst, 'reload schema';
