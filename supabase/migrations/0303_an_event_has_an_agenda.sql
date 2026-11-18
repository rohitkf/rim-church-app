-- An event has an agenda.
--
-- A registration event says when it is and where, and a paragraph about
-- it. What happens on the day — doors at nine, worship at half past, who
-- is speaking after lunch — went into that paragraph, or onto a poster
-- somebody had to make. The Owner asked for an agenda (November 2026):
-- the running order of the day, as the Service Planner has for a service,
-- on the event's own page.
--
-- **An item is a title, and whatever else is known.** A start time, an end
-- time and a line of detail (who is speaking, which room) are each
-- optional: an agenda is often written before the times are settled, and
-- "Lunch" needs no detail. A time is the venue's own clock — a `time`, not
-- a moment — because that is what an agenda says: 09:30 is 09:30 whoever
-- is reading it, from wherever. An end may be before its start: a watch
-- night runs past midnight.
--
-- **In the order it was arranged, not the order of its times.** Items with
-- no time have to sit somewhere, and the person who wrote it knows where.
--
-- **An event over several days can say which day.** An item may name one
-- of the event's dates, or none: none is "each day", or an event with one
-- date. The date must be one of this event's own, and an item goes with
-- its date if the date is removed.
--
-- **Read by whoever works registrations, written by whoever edits events,
-- and shown to everybody on the event's public page** — the same three
-- doors the dates and ticket types have (0244, 0247, 0251). Nothing about
-- an agenda is private: it is published with the event, and a draft's is
-- seen only by the office, as the draft is.

-- ---------------------------------------------------------------------------
-- The agenda
-- ---------------------------------------------------------------------------
create table if not exists public.registration_event_agenda (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.registration_events (id) on delete cascade,
  -- Which of the event's days, when it has several; null is each day.
  date_id uuid references public.registration_event_dates (id) on delete cascade,
  sort_order int not null default 0,
  title text not null check (length(btrim(title)) between 1 and 120),
  details text check (details is null or length(details) <= 300),
  starts time,
  ends time,
  created_at timestamptz not null default now(),
  -- An end is the end of something that starts.
  constraint registration_event_agenda_end_has_a_start check (ends is null or starts is not null),
  constraint registration_event_agenda_end_is_not_the_start check (ends is null or ends <> starts)
);

comment on table public.registration_event_agenda is
  'The running order of a registration event: a title, and optionally times, a line of detail and which day. Published with the event.';

create index if not exists registration_event_agenda_event_idx on public.registration_event_agenda (event_id, sort_order);
create index if not exists registration_event_agenda_date_idx on public.registration_event_agenda (date_id);

-- The day an item names is one of its own event's.
create or replace function public.registration_event_agenda_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.date_id is not null and not exists (
    select 1 from public.registration_event_dates d where d.id = new.date_id and d.event_id = new.event_id
  ) then
    raise exception 'That day is not one of this event''s dates.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.registration_event_agenda_guard() from public, anon, authenticated;

drop trigger if exists registration_event_agenda_guard on public.registration_event_agenda;
create trigger registration_event_agenda_guard
  before insert or update on public.registration_event_agenda
  for each row execute function public.registration_event_agenda_guard();

alter table public.registration_event_agenda enable row level security;

drop policy if exists registration_event_agenda_select on public.registration_event_agenda;
create policy registration_event_agenda_select on public.registration_event_agenda
  for select using ((select public.registration_may_work((select auth.uid()))));
drop policy if exists registration_event_agenda_insert on public.registration_event_agenda;
create policy registration_event_agenda_insert on public.registration_event_agenda
  for insert with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_event_agenda_update on public.registration_event_agenda;
create policy registration_event_agenda_update on public.registration_event_agenda
  for update using ((select public.registration_can((select auth.uid()), 'edit')))
  with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_event_agenda_delete on public.registration_event_agenda;
create policy registration_event_agenda_delete on public.registration_event_agenda
  for delete using ((select public.registration_can((select auth.uid()), 'edit')));

-- Nobody signed out reads the table: the public page asks the function below.
revoke all on public.registration_event_agenda from anon;
grant select, insert, update, delete on public.registration_event_agenda to authenticated;

-- Every open screen hears that it changed (0202).
drop trigger if exists registration_event_agenda_live on public.registration_event_agenda;
create trigger registration_event_agenda_live after insert or update or delete on public.registration_event_agenda for each statement execute function public.live_table_changed();

-- ---------------------------------------------------------------------------
-- The public page carries it
-- ---------------------------------------------------------------------------
-- 0251's function with one key more. The app in production reads the keys
-- it knows and ignores this one.
create or replace function public.registration_public_event(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  ev public.registration_events%rowtype;
  closes timestamptz;
  starts timestamptz;
  open boolean;
  why text;
begin
  select * into ev from public.registration_events where slug = lower(btrim(p_slug));
  if not found then return null; end if;
  if ev.status = 'draft' and not public.registration_can(auth.uid(), 'office') then return null; end if;

  closes := public.registration_closes(ev);
  select min(starts_at) into starts from public.registration_event_dates where event_id = ev.id;
  open := ev.status = 'published'
      and (ev.registration_opens_at is null or ev.registration_opens_at <= now())
      and (closes is null or closes > now());
  why := case
    when ev.status = 'draft' then 'draft'
    when ev.cancelled_at is not null then 'cancelled'
    when ev.status = 'closed' then 'closed'
    when ev.registration_opens_at is not null and ev.registration_opens_at > now() then 'not_yet'
    when closes is not null and closes <= now() then 'over'
    else null
  end;

  return jsonb_build_object(
    'id', ev.id,
    'slug', ev.slug,
    'title', ev.title,
    'description', ev.description,
    'image_path', ev.image_path,
    'image_focus', jsonb_build_object('x', ev.image_focus_x, 'y', ev.image_focus_y),
    'status', ev.status,
    'date_mode', ev.date_mode,
    'location', jsonb_build_object('name', ev.location_name, 'address', ev.address, 'latitude', ev.latitude, 'longitude', ev.longitude),
    'attendance', ev.attendance,
    'cancelled_at', ev.cancelled_at,
    'cancel_note', ev.cancel_note,
    'opens_at', ev.registration_opens_at,
    'closes_at', closes,
    'open', open,
    'closed_reason', why,
    'min_per_order', ev.min_per_order,
    'max_per_order', ev.max_per_order,
    'allow_pay_at_reception', ev.allow_pay_at_reception,
    'payment_note', ev.payment_note,
    'dates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label,
        'open', d.starts_at > now()
      ) order by d.starts_at, d.sort_order), '[]'::jsonb)
      from public.registration_event_dates d where d.event_id = ev.id
    ),
    'ticket_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'description', t.description, 'kind', t.kind,
        'price_pence', t.price_pence, 'min_donation_pence', t.min_donation_pence,
        'quantity', t.quantity,
        'remaining', case when t.quantity is null or ev.date_mode = 'choose' then null
                          else greatest(t.quantity - public.registration_sold(t.id), 0) end,
        'remaining_by_date', case when t.quantity is null or ev.date_mode <> 'choose' then '{}'::jsonb
          else (select coalesce(jsonb_object_agg(d.id::text, greatest(t.quantity - public.registration_sold(t.id, d.id), 0)), '{}'::jsonb)
                from public.registration_event_dates d where d.event_id = ev.id) end
      ) order by t.sort_order, t.name), '[]'::jsonb)
      from public.registration_ticket_types t where t.event_id = ev.id
    ),
    -- The agenda (0303), in the order the editor left it. A time is the
    -- venue's own clock, said as it was typed: nothing to convert.
    'agenda', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'date_id', a.date_id, 'title', a.title, 'details', a.details,
        'starts', to_char(a.starts, 'HH24:MI'), 'ends', to_char(a.ends, 'HH24:MI')
      ) order by a.sort_order, a.created_at, a.id), '[]'::jsonb)
      from public.registration_event_agenda a where a.event_id = ev.id
    ),
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$function$;

notify pgrst, 'reload schema';
select public.migration_done(303, '0303_an_event_has_an_agenda', 'ecd1e6cab2a5690de0191cc6b033711f72d0a8d7151ef497be5ee45d7d2f2f1f');
