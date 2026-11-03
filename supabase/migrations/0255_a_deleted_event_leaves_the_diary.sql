-- 0255: a registration event that is deleted takes its diary rows with it
-- (found by the Owner after deleting a test event).
--
-- A published event with add_to_diary has one church_events row per date,
-- and the date points at it (registration_event_dates.diary_event_id,
-- "on delete set null"). Cancelling an event drops those rows, and
-- registration_sync_diary keeps them in step while the event lives — but
-- deleting the event cascaded to its dates and left the diary rows
-- standing, with a Register link to a page that now says "No such
-- event". The same happened to a date taken out in the editor.
--
-- So a date that goes takes its diary row with it, whoever deletes it
-- and however: a trigger, not something each page has to remember. And
-- the rows already left behind — a Register link, and no date pointing
-- at them — are tidied once here.

create or replace function public.registration_event_dates_take_diary_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.diary_event_id is not null then
    delete from public.church_events where id = old.diary_event_id;
  end if;
  return old;
end;
$$;

drop trigger if exists registration_event_dates_take_diary_row on public.registration_event_dates;
-- After, not before: the diary row's own link back ("on delete set null")
-- would otherwise touch the very date being deleted.
create trigger registration_event_dates_take_diary_row
  after delete on public.registration_event_dates
  for each row execute function public.registration_event_dates_take_diary_row();

comment on function public.registration_event_dates_take_diary_row() is
  'A registration date that is deleted takes its church_events row with it (0255), so a deleted event or a removed date leaves no diary entry pointing at a page that is gone.';

-- The rows already orphaned: made by registration_sync_diary (their one
-- link is the Register link), and no date left pointing at them.
delete from public.church_events e
where e.links @> '[{"label": "Register"}]'::jsonb
  and (e.links -> 0 ->> 'url') like '%/register/%'
  and not exists (select 1 from public.registration_event_dates d where d.diary_event_id = e.id);
