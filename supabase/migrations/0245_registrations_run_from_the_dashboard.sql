-- Registrations, run from the dashboard (asked for by the Owner, the second
-- of four parts; the first was 0244).
--
-- Three things the people running an event need once registrations come in:
--
--   1. To act on an order — mark a payment received or waived, put it back
--      to awaiting, check somebody in at the door, cancel a registration or
--      put a cancelled one back. One function, registration_order_mark(),
--      does each with the timestamps set here rather than by the screen,
--      and a cancelled order coming back is checked against what is left,
--      the same way a new one is.
--
--   2. To hear when a ticket type sells out, without watching the page.
--      registration_register() now calls registration_sold_out_notify()
--      for each type on an order; when that type (on that date, where
--      people pick one) has just reached its quantity, everybody who may
--      run registrations gets a notification, which push-notify sends to
--      their phone like any other. Once a day per sentence, so a place
--      freed and sold again does not nag.
--
--   3. Not to keep people's details for ever. An event's orders are the
--      church's records — what was paid, how many came — but the names,
--      emails and phone numbers on them are only needed until the event
--      is over. app_settings.registration_retention_days (90; null never)
--      says how long after an event's last date they are kept; the nightly
--      registration_anonymise() then blanks name, email, phone, the
--      attendee names and the church's own notes on every order of that
--      event, and stamps anonymised_at. The order, its code and its sums
--      stay until the event is deleted. Settings › Retention; the sentence
--      on the Registrations page comes from lib/lifespan.

-- ---------------------------------------------------------------------------
-- Acting on an order
-- ---------------------------------------------------------------------------

create or replace function public.registration_order_mark(p_id uuid, p_action text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  line record;
  tt public.registration_ticket_types%rowtype;
begin
  if not public.may(auth.uid(), 'reg.manage') then
    raise exception 'Only whoever runs registrations may change an order.';
  end if;
  select * into o from public.registration_orders where id = p_id for update;
  if not found then raise exception 'No such registration.'; end if;

  if p_action in ('received', 'waived', 'awaiting') then
    if o.payment_status = 'not_needed' then raise exception 'There is nothing to pay on this registration.'; end if;
    update public.registration_orders set payment_status = p_action where id = p_id;
  elsif p_action = 'check_in' then
    if o.status <> 'confirmed' then raise exception 'A cancelled registration cannot be checked in. Put it back first.'; end if;
    update public.registration_orders set checked_in_at = now(), checked_in_by = auth.uid() where id = p_id;
  elsif p_action = 'undo_check_in' then
    update public.registration_orders set checked_in_at = null, checked_in_by = null where id = p_id;
  elsif p_action = 'cancel' then
    update public.registration_orders
    set status = 'cancelled', cancelled_at = now(), checked_in_at = null, checked_in_by = null
    where id = p_id and status = 'confirmed';
  elsif p_action = 'restore' then
    if o.status = 'confirmed' then return; end if;
    -- Its tickets go back on: only if they still fit.
    perform 1 from public.registration_ticket_types where event_id = o.event_id for update;
    for line in
      select t.ticket_type_id, count(*)::int as n from public.registration_order_tickets t where t.order_id = o.id group by 1
    loop
      select * into tt from public.registration_ticket_types where id = line.ticket_type_id;
      if tt.quantity is not null and public.registration_sold(tt.id, o.date_id) + line.n > tt.quantity then
        raise exception 'Not enough "%" left to put this registration back.', tt.name;
      end if;
    end loop;
    update public.registration_orders set status = 'confirmed', cancelled_at = null where id = p_id;
  else
    raise exception 'Unknown action: %', p_action;
  end if;
end;
$$;

revoke all on function public.registration_order_mark(uuid, text) from public, anon;
grant execute on function public.registration_order_mark(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sold out: a notification to whoever runs registrations
-- ---------------------------------------------------------------------------

-- Everybody the grid gives reg.manage — the Owner always.
create or replace function public.registration_managers()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p where public.may(p.id, 'reg.manage')
$$;

revoke all on function public.registration_managers() from public, anon, authenticated;

create or replace function public.registration_sold_out_notify(p_event uuid, p_type uuid, p_date uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  tt public.registration_ticket_types%rowtype;
  tz text := coalesce((select timezone from public.app_settings limit 1), 'Europe/London');
  when_words text;
  said text;
begin
  select * into tt from public.registration_ticket_types where id = p_type;
  if not found or tt.quantity is null then return; end if;
  if public.registration_sold(tt.id, p_date) < tt.quantity then return; end if;
  select * into ev from public.registration_events where id = p_event;
  if p_date is not null then
    select coalesce(d.label, to_char(d.starts_at at time zone tz, 'FMDay FMDD Mon'))
    into when_words from public.registration_event_dates d where d.id = p_date;
  end if;
  said := format('"%s" has sold out for %s%s.', tt.name, ev.title,
                 case when when_words is not null then ' on ' || when_words else '' end);
  insert into public.notifications (user_id, type, reference_id, body)
  select m, 'registration_sold_out', ev.id, said
  from public.registration_managers() m
  where not exists (
    select 1 from public.notifications n
    where n.user_id = m and n.type = 'registration_sold_out' and n.body = said
      and n.created_at > now() - interval '1 day'
  );
end;
$$;

revoke all on function public.registration_sold_out_notify(uuid, uuid, uuid) from public, anon, authenticated;

-- registration_register as 0244 wrote it, with the one call added after a
-- line's tickets are in.
create or replace function public.registration_register(p_slug text, p_order jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  closes timestamptz;
  v_name text := btrim(coalesce(p_order ->> 'name', ''));
  v_email text := lower(btrim(coalesce(p_order ->> 'email', '')));
  v_phone text := nullif(btrim(coalesce(p_order ->> 'phone', '')), '');
  v_date uuid := nullif(p_order ->> 'date_id', '')::uuid;
  v_promo text := upper(btrim(coalesce(p_order ->> 'promo_code', '')));
  promo public.registration_promo_codes%rowtype;
  line jsonb;
  tt public.registration_ticket_types%rowtype;
  qty int;
  unit int;
  names jsonb;
  i int;
  total_qty int := 0;
  subtotal int := 0;
  discountable int := 0;
  discount int := 0;
  order_id uuid := gen_random_uuid();
  v_code text;
  seen uuid[] := '{}';
begin
  -- A field no person sees, filled in: a bot. Say yes and do nothing.
  if coalesce(p_order ->> 'website', '') <> '' then
    return jsonb_build_object('ok', true, 'code', null);
  end if;

  select * into ev from public.registration_events where slug = lower(btrim(p_slug)) for update;
  if not found or ev.status <> 'published' then
    raise exception 'Registration is not open for this event.';
  end if;
  closes := public.registration_closes(ev);
  if ev.registration_opens_at is not null and ev.registration_opens_at > now() then
    raise exception 'Registration has not opened yet.';
  end if;
  if closes is not null and closes <= now() then
    raise exception 'Registration has closed.';
  end if;

  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'Please give your name.'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'That email address does not look right.';
  end if;
  if v_phone is not null and length(v_phone) > 40 then raise exception 'That phone number is too long.'; end if;

  if ev.date_mode = 'choose' then
    if v_date is null or not exists (
      select 1 from public.registration_event_dates d where d.id = v_date and d.event_id = ev.id and d.starts_at > now()
    ) then
      raise exception 'Please choose a date that has not started yet.';
    end if;
  else
    v_date := null;
  end if;

  -- Too many orders under one address: a loop, or somebody's script.
  if (select count(*) from public.registration_orders o
      where o.event_id = ev.id and lower(o.email) = v_email and o.status = 'confirmed') >= 5 then
    raise exception 'There are already several registrations under this email address. Please contact the church.';
  end if;

  if v_promo <> '' then
    select * into promo from public.registration_promo_codes p
    where p.event_id = ev.id and p.code = v_promo and p.active
      and (p.max_uses is null or p.uses < p.max_uses)
    for update;
    if not found then raise exception 'That promo code is not valid.'; end if;
  end if;

  if jsonb_typeof(p_order -> 'lines') <> 'array' or jsonb_array_length(p_order -> 'lines') = 0 then
    raise exception 'Choose at least one ticket.';
  end if;

  -- Hold the event's ticket types, so two people cannot take the last one.
  perform 1 from public.registration_ticket_types where event_id = ev.id for update;

  insert into public.registration_orders
    (id, code, event_id, date_id, name, email, phone, quantity, payment_status)
  values
    (order_id, public.registration_new_code(), ev.id, v_date, v_name, v_email, v_phone, 1, 'not_needed')
  returning code into v_code;

  for line in select value from jsonb_array_elements(p_order -> 'lines') loop
    select * into tt from public.registration_ticket_types
    where id = nullif(line ->> 'ticket_type_id', '')::uuid and event_id = ev.id;
    if not found then raise exception 'One of those tickets is no longer offered.'; end if;
    if tt.id = any (seen) then raise exception 'A ticket is listed twice.'; end if;
    seen := seen || tt.id;

    qty := coalesce((line ->> 'quantity')::int, 0);
    if qty <= 0 then continue; end if;
    if qty > 100 then raise exception 'That is too many tickets.'; end if;
    if tt.quantity is not null and public.registration_sold(tt.id, v_date) + qty > tt.quantity then
      raise exception 'Only % of "%" left.', greatest(tt.quantity - public.registration_sold(tt.id, v_date), 0), tt.name;
    end if;

    unit := case tt.kind
      when 'free' then 0
      when 'paid' then tt.price_pence
      else coalesce((line ->> 'donation_pence')::int, 0)
    end;
    if tt.kind = 'donation' and (unit < 0 or unit > 1000000 or unit < coalesce(tt.min_donation_pence, 0)) then
      raise exception 'The least for "%" is £%.', tt.name, to_char(coalesce(tt.min_donation_pence, 0) / 100.0, 'FM999990.00');
    end if;

    names := case when jsonb_typeof(line -> 'attendee_names') = 'array' then line -> 'attendee_names' else '[]'::jsonb end;
    for i in 1..qty loop
      insert into public.registration_order_tickets (order_id, ticket_type_id, attendee_name, unit_price_pence)
      values (order_id, tt.id, nullif(left(btrim(coalesce(names ->> (i - 1), '')), 120), ''), unit);
    end loop;
    -- The last of a type gone: tell whoever runs registrations (0245). Inside
    -- the same transaction, so a later line failing takes the notice with it.
    perform public.registration_sold_out_notify(ev.id, tt.id, v_date);

    total_qty := total_qty + qty;
    subtotal := subtotal + unit * qty;
    if tt.kind = 'paid' and promo.id is not null
       and (cardinality(promo.ticket_type_ids) = 0 or tt.id = any (promo.ticket_type_ids)) then
      discountable := discountable + unit * qty;
    end if;
  end loop;

  if total_qty < ev.min_per_order then
    raise exception 'At least % % per order.', ev.min_per_order, case when ev.min_per_order = 1 then 'ticket' else 'tickets' end;
  end if;
  if total_qty > ev.max_per_order then
    raise exception 'At most % % per order.', ev.max_per_order, case when ev.max_per_order = 1 then 'ticket' else 'tickets' end;
  end if;

  if promo.id is not null then
    discount := case promo.kind
      when 'amount' then least(promo.value, discountable)
      else (discountable * promo.value / 100.0)::int
    end;
    update public.registration_promo_codes set uses = uses + 1 where id = promo.id;
  end if;

  update public.registration_orders
  set quantity = total_qty,
      subtotal_pence = subtotal,
      discount_pence = discount,
      total_pence = subtotal - discount,
      promo_code = promo.code,
      promo_code_id = promo.id,
      payment_status = case when subtotal - discount > 0 then 'awaiting' else 'not_needed' end
  where id = order_id;

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention: the details blanked, the records kept
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column if not exists registration_retention_days integer default 90;
alter table public.app_settings drop constraint if exists app_settings_registration_retention_days_check;
alter table public.app_settings
  add constraint app_settings_registration_retention_days_check
  check (registration_retention_days is null or registration_retention_days between 1 and 3650);
comment on column public.app_settings.registration_retention_days is
  'Days after an event''s last date before the name, email, phone and attendee names on its orders are blanked by registration_anonymise(); null keeps them for ever.';

create or replace function public.registration_anonymise()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  keep_days integer := (select registration_retention_days from public.app_settings limit 1);
begin
  if keep_days is null then return; end if;
  create temp table if not exists _reg_done (event_id uuid primary key) on commit drop;
  insert into _reg_done
  select e.id from public.registration_events e
  where (select max(coalesce(d.ends_at, d.starts_at)) from public.registration_event_dates d where d.event_id = e.id)
        < now() - make_interval(days => keep_days);
  update public.registration_order_tickets t
  set attendee_name = null
  from public.registration_orders o
  where t.order_id = o.id and o.anonymised_at is null and t.attendee_name is not null
    and o.event_id in (select event_id from _reg_done);
  update public.registration_orders o
  set name = 'Anonymised',
      email = 'anonymised@removed.invalid',
      phone = null,
      notes = null,
      anonymised_at = now()
  where o.anonymised_at is null and o.event_id in (select event_id from _reg_done);
end;
$$;

revoke all on function public.registration_anonymise() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'registration-anonymise';
    perform cron.schedule('registration-anonymise', '35 3 * * *', 'select public.registration_anonymise()');
  end if;
end;
$cron$;
