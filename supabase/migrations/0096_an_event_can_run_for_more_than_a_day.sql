/*
 * An event can run for more than a day.
 *
 * `church_events` held one date, because most of a church diary is "the
 * 14th". But a good deal of it is not: a conference over a weekend, a week
 * of prayer, a workday and the clearing-up the day after. Those went in as
 * three separate events with the same name, or as one event on the first
 * day with the rest of it written into the details — which is a diary that
 * cannot answer "what is on, on Saturday".
 *
 * So: an optional end. Null means what it has always meant — one day — so
 * every row already in the table is already correct, and a diary entry
 * without a run is unchanged in every way.
 */

alter table public.church_events
  add column if not exists ends_on date;

comment on column public.church_events.ends_on is
  'Last day of a run, inclusive. Null for a single-day event.';

-- A run that ends before it starts is not a run. Written as a constraint
-- rather than trusted to the form, because the form is not the only way in.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'church_events_ends_after_it_starts'
  ) then
    alter table public.church_events
      add constraint church_events_ends_after_it_starts
      check (ends_on is null or ends_on >= event_date);
  end if;
end $$;

-- The diary reads a window of days and asks what falls inside it, so the
-- end is worth an index of its own.
create index if not exists church_events_by_end on public.church_events (ends_on)
  where ends_on is not null;
