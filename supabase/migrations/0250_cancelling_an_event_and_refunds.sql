-- Cancelling an event, and refunds (asked for by the Owner after a test run).
--
-- Deleting an event took every order with it — who paid, how much, and
-- the only record of what is owed back. Now:
--
--   1. An event is cancelled, not deleted: registration_event_cancel()
--      closes it for good (cancelled_at, cancel_note; it cannot be
--      reopened), takes it out of the church diary, and marks every live
--      order whose money is in (or said to be in) as owing a refund.
--      Every order stays.
--
--   2. A refund is tracked on the order: refund_status 'owed' →
--      'refunded', with refund_at and refund_by, like a payment. An order
--      cancelled with its money in — by the church or by the attendee —
--      owes one too.
--
--   3. Most refunds need nothing from the attendee: a bank transfer goes
--      back to the account it came from, a PayPal payment back through
--      PayPal. Only money taken at reception (cash) has nowhere to go, so
--      only those orders may send their bank details, through
--      registration_refund_request(), into registration_refund_details —
--      a private table only whoever runs registrations can read — and the
--      row is deleted the moment the refund is marked done.
--
--   4. Deleting is for a test or a duplicate: an order whose money is in
--      and not refunded cannot be deleted, and only the Owner may delete
--      an event.
--
-- Also: an attendee can no longer cancel a ticket that has been checked in.

alter table public.registration_events
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_note text check (cancel_note is null or length(cancel_note) <= 1000);
comment on column public.registration_events.cancelled_at is 'When the church called the event off; it stays closed, and its orders stay.';

alter table public.registration_orders
  add column if not exists refund_status text check (refund_status is null or refund_status in ('owed', 'refunded')),
  add column if not exists refund_at timestamptz,
  add column if not exists refund_by uuid references public.profiles (id) on delete set null;
comment on column public.registration_orders.refund_status is 'owed: money is in and the order or the event was cancelled; refunded: sent back (refund_at, refund_by).';

create index if not exists registration_orders_refund_by_idx on public.registration_orders (refund_by);

/** Would this order owe a refund if it were cancelled now? Its money is in, or said to be. */
create or replace function public.registration_money_in(o public.registration_orders)
returns boolean
language sql
immutable
set search_path = public
as $$
  select o.total_pence > 0 and o.payment_status in ('received', 'reported')
$$;

-- ---------------------------------------------------------------------
-- Where to send a refund that cannot go back the way it came
-- ---------------------------------------------------------------------

create table if not exists public.registration_refund_details (
  order_id uuid primary key references public.registration_orders (id) on delete cascade,
  account_name text not null check (length(account_name) between 1 and 120),
  sort_code text check (sort_code is null or sort_code ~ '^[0-9]{6}$'),
  account_number text check (account_number is null or account_number ~ '^[0-9]{8}$'),
  iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check ((sort_code is not null and account_number is not null) or iban is not null)
);
comment on table public.registration_refund_details is 'Bank details sent for a refund that cannot go back the way it was paid (cash at reception). Readable only by reg.manage; deleted when the refund is marked done.';
alter table public.registration_refund_details enable row level security;
drop policy if exists registration_refund_details_select on public.registration_refund_details;
create policy registration_refund_details_select on public.registration_refund_details
  for select using (public.may((select auth.uid()), 'reg.manage'));
-- No insert, update or delete policy: registration_refund_request() writes,
-- registration_order_mark('refunded') deletes.

/** May this order send bank details for its refund: owed, and paid at reception. */
create or replace function public.registration_refund_needs_details(o public.registration_orders)
returns boolean
language sql
immutable
set search_path = public
as $$
  select o.refund_status = 'owed' and coalesce(o.payment_method, 'reception') = 'reception'
$$;

create or replace function public.registration_refund_request(p_code text, p_details jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  v_name text := btrim(coalesce(p_details ->> 'account_name', ''));
  v_sort text := nullif(regexp_replace(coalesce(p_details ->> 'sort_code', ''), '[^0-9]', '', 'g'), '');
  v_acct text := nullif(regexp_replace(coalesce(p_details ->> 'account_number', ''), '[^0-9]', '', 'g'), '');
  v_iban text := nullif(upper(regexp_replace(coalesce(p_details ->> 'iban', ''), '\s', '', 'g')), '');
  v_note text := nullif(left(btrim(coalesce(p_details ->> 'note', '')), 500), '');
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'No such ticket.'; end if;
  if not public.registration_refund_needs_details(o) then
    raise exception 'This refund goes back the way you paid; there is nothing to send.';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'Give the name on the account.'; end if;
  if v_iban is null and (v_sort is null or v_acct is null) then
    raise exception 'Give the sort code and account number, or an IBAN.';
  end if;
  if v_sort is not null and v_sort !~ '^[0-9]{6}$' then raise exception 'A sort code is six digits.'; end if;
  if v_acct is not null and v_acct !~ '^[0-9]{8}$' then raise exception 'An account number is eight digits.'; end if;
  if v_iban is not null and v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then raise exception 'That IBAN does not look right.'; end if;

  insert into public.registration_refund_details (order_id, account_name, sort_code, account_number, iban, note)
  values (o.id, v_name, v_sort, v_acct, v_iban, v_note)
  on conflict (order_id) do update
    set account_name = excluded.account_name, sort_code = excluded.sort_code, account_number = excluded.account_number,
        iban = excluded.iban, note = excluded.note, created_at = now();
end;
$$;
revoke all on function public.registration_refund_request(text, jsonb) from public;
grant execute on function public.registration_refund_request(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Calling an event off
-- ---------------------------------------------------------------------

create or replace function public.registration_event_cancel(p_event uuid, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  owed int;
begin
  if not public.may(auth.uid(), 'reg.manage') then
    raise exception 'Only whoever runs registrations may cancel an event.' using errcode = '42501';
  end if;
  select * into ev from public.registration_events where id = p_event for update;
  if not found then raise exception 'No such event.'; end if;
  if ev.cancelled_at is not null then return jsonb_build_object('ok', true, 'owed', 0); end if;
  if ev.status = 'draft' then raise exception 'A draft has nobody on it; delete it instead.'; end if;

  update public.registration_events
  set status = 'closed', cancelled_at = now(), cancel_note = nullif(left(btrim(coalesce(p_note, '')), 1000), '')
  where id = ev.id;

  update public.registration_orders o
  set refund_status = 'owed'
  where o.event_id = ev.id and o.status = 'confirmed' and o.refund_status is null and public.registration_money_in(o);
  get diagnostics owed = row_count;

  -- Out of the church diary.
  delete from public.church_events e
  where e.id in (select diary_event_id from public.registration_event_dates where event_id = ev.id and diary_event_id is not null);

  return jsonb_build_object('ok', true, 'owed', owed);
end;
$$;
revoke all on function public.registration_event_cancel(uuid, text) from public, anon;
grant execute on function public.registration_event_cancel(uuid, text) to authenticated;

/** A cancelled event stays closed, and only the Owner deletes an event. */
create or replace function public.registration_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.cancelled_at is not null and new.status <> 'closed' then
      raise exception 'A cancelled event cannot be reopened.';
    end if;
    if old.cancelled_at is not null and new.cancelled_at is null then
      raise exception 'A cancelled event stays cancelled.';
    end if;
    return new;
  end if;
  -- DELETE: the Owner only (maintenance with no signed-in user is let through).
  if auth.uid() is not null and not exists (select 1 from public.app_owner where user_id = auth.uid()) then
    raise exception 'Only the Owner may delete an event. Cancel it instead.' using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists registration_events_guard on public.registration_events;
create trigger registration_events_guard before update or delete on public.registration_events
  for each row execute function public.registration_events_guard();

/** An order whose money is in, and not refunded, is not deleted. */
create or replace function public.registration_orders_keep_unrefunded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.registration_money_in(old) and coalesce(old.refund_status, '') <> 'refunded' then
    raise exception 'Some people on this event have paid and are not refunded yet. Cancel the event, refund them, then delete it.';
  end if;
  return old;
end;
$$;
drop trigger if exists registration_orders_keep_unrefunded on public.registration_orders;
create trigger registration_orders_keep_unrefunded before delete on public.registration_orders
  for each row execute function public.registration_orders_keep_unrefunded();

-- ---------------------------------------------------------------------
-- The attendee cancels: not once checked in; a refund owed if paid
-- ---------------------------------------------------------------------

create or replace function public.registration_order_cancel(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  starts timestamptz;
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'No such ticket.'; end if;
  if o.status = 'cancelled' then return; end if;
  if o.checked_in_at is not null then raise exception 'This ticket has been checked in, so it can no longer be cancelled.'; end if;
  select coalesce(
    (select d.starts_at from public.registration_event_dates d where d.id = o.date_id),
    (select min(d.starts_at) from public.registration_event_dates d where d.event_id = o.event_id)
  ) into starts;
  if starts is not null and starts <= now() then raise exception 'The event has started; this ticket can no longer be cancelled.'; end if;

  update public.registration_orders
  set status = 'cancelled', cancelled_at = now(),
      refund_status = case when public.registration_money_in(o) then 'owed' else refund_status end
  where id = o.id;
  if o.promo_code_id is not null then
    update public.registration_promo_codes set uses = greatest(uses - 1, 0) where id = o.promo_code_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Acting on an order: as 0247, plus refunds
-- ---------------------------------------------------------------------

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
  ev public.registration_events%rowtype;
  office boolean := public.may(auth.uid(), 'reg.manage');
  door boolean := public.may(auth.uid(), 'reg.door');
begin
  if not (office or door) then
    raise exception 'Only whoever runs registrations or works the door may change an order.';
  end if;
  if not office and p_action not in ('check_in', 'undo_check_in', 'received') then
    raise exception 'The door may check people in and take payments; the rest is for whoever runs registrations.';
  end if;
  select * into o from public.registration_orders where id = p_id for update;
  if not found then raise exception 'No such registration.'; end if;
  select * into ev from public.registration_events where id = o.event_id;

  if p_action in ('received', 'waived') then
    if o.payment_status = 'not_needed' then raise exception 'There is nothing to pay on this registration.'; end if;
    update public.registration_orders
    set payment_status = p_action, received_at = now(), received_by = auth.uid(),
        payment_method = coalesce(payment_method, 'reception')
    where id = p_id;
  elsif p_action = 'awaiting' then
    if o.payment_status = 'not_needed' then raise exception 'There is nothing to pay on this registration.'; end if;
    if o.refund_status is not null then raise exception 'This registration is being refunded.'; end if;
    update public.registration_orders set payment_status = 'awaiting', received_at = null, received_by = null where id = p_id;
  elsif p_action = 'check_in' then
    if o.status <> 'confirmed' then raise exception 'A cancelled registration cannot be checked in. Put it back first.'; end if;
    if ev.cancelled_at is not null then raise exception 'This event was cancelled.'; end if;
    update public.registration_orders set checked_in_at = now(), checked_in_by = auth.uid() where id = p_id;
  elsif p_action = 'undo_check_in' then
    update public.registration_orders set checked_in_at = null, checked_in_by = null where id = p_id;
  elsif p_action = 'cancel' then
    update public.registration_orders
    set status = 'cancelled', cancelled_at = now(), checked_in_at = null, checked_in_by = null,
        refund_status = case when public.registration_money_in(o) and refund_status is null then 'owed' else refund_status end
    where id = p_id and status = 'confirmed';
  elsif p_action = 'restore' then
    if o.status = 'confirmed' then return; end if;
    if ev.cancelled_at is not null then raise exception 'This event was cancelled.'; end if;
    if o.refund_status = 'refunded' then raise exception 'This registration was refunded; register them again instead.'; end if;
    perform 1 from public.registration_ticket_types where event_id = o.event_id for update;
    for line in
      select t.ticket_type_id, count(*)::int as n from public.registration_order_tickets t where t.order_id = o.id group by 1
    loop
      select * into tt from public.registration_ticket_types where id = line.ticket_type_id;
      if tt.quantity is not null and public.registration_sold(tt.id, o.date_id) + line.n > tt.quantity then
        raise exception 'Not enough "%" left to put this registration back.', tt.name;
      end if;
    end loop;
    -- Back on: nothing is owed back after all.
    update public.registration_orders
    set status = 'confirmed', cancelled_at = null, refund_status = case when refund_status = 'owed' then null else refund_status end
    where id = p_id;
  elsif p_action = 'refunded' then
    if o.refund_status is distinct from 'owed' then raise exception 'There is no refund owed on this registration.'; end if;
    update public.registration_orders set refund_status = 'refunded', refund_at = now(), refund_by = auth.uid() where id = p_id;
    delete from public.registration_refund_details where order_id = p_id;
  else
    raise exception 'Unknown action: %', p_action;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- The public page and the ticket learn of a cancellation and a refund
-- ---------------------------------------------------------------------

create or replace function public.registration_public_event(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  closes timestamptz;
  starts timestamptz;
  open boolean;
  why text;
begin
  select * into ev from public.registration_events where slug = lower(btrim(p_slug));
  if not found then return null; end if;
  if ev.status = 'draft' and not public.may(auth.uid(), 'reg.manage') then return null; end if;

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
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$$;

create or replace function public.registration_order_view(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  ev public.registration_events%rowtype;
  starts timestamptz;
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code));
  if not found then return null; end if;
  select * into ev from public.registration_events where id = o.event_id;
  select coalesce(
    (select d.starts_at from public.registration_event_dates d where d.id = o.date_id),
    (select min(d.starts_at) from public.registration_event_dates d where d.event_id = ev.id)
  ) into starts;

  return jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'name', o.name,
    'email', o.email,
    'phone', o.phone,
    'quantity', o.quantity,
    'subtotal_pence', o.subtotal_pence,
    'discount_pence', o.discount_pence,
    'total_pence', o.total_pence,
    'promo_code', o.promo_code,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'proof_at', o.proof_at,
    'proof_reference', o.proof_reference,
    'source', o.source,
    'checked_in_at', o.checked_in_at,
    'created_at', o.created_at,
    'can_cancel', o.status = 'confirmed' and (starts is null or starts > now()),
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type_name', t.name, 'kind', t.kind, 'attendee_name', x.attendee_name, 'unit_price_pence', x.unit_price_pence
      ) order by t.sort_order, x.id), '[]'::jsonb)
      from public.registration_order_tickets x
      join public.registration_ticket_types t on t.id = x.ticket_type_id
      where x.order_id = o.id
    ),
    'date', (
      select jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label)
      from public.registration_event_dates d where d.id = o.date_id
    ),
    'event', jsonb_build_object(
      'slug', ev.slug, 'title', ev.title, 'image_path', ev.image_path,
      'image_focus', jsonb_build_object('x', ev.image_focus_x, 'y', ev.image_focus_y), 'status', ev.status, 'date_mode', ev.date_mode,
      'location', jsonb_build_object('name', ev.location_name, 'address', ev.address, 'latitude', ev.latitude, 'longitude', ev.longitude),
      'attendance', ev.attendance,
      'cancelled_at', ev.cancelled_at,
      'cancel_note', ev.cancel_note,
      'allow_pay_at_reception', ev.allow_pay_at_reception,
      'payment_note', ev.payment_note,
      'dates', (
        select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label)
                                  order by d.starts_at, d.sort_order), '[]'::jsonb)
        from public.registration_event_dates d where d.event_id = ev.id
      )
    ),
    -- The way in, for an event online: only on a live order that has nothing
    -- left to pay, so a link cannot be passed round before the money is in.
    'join', case
      when ev.attendance <> 'in_person' and o.status = 'confirmed' and ev.cancelled_at is null
           and o.payment_status in ('not_needed', 'received', 'waived')
      then jsonb_build_object('url', ev.join_url, 'details', ev.join_details)
      else null
    end,
    'refund_status', o.refund_status,
    'refund_at', o.refund_at,
    'refund_details_wanted', public.registration_refund_needs_details(o),
    'refund_details_sent', exists (select 1 from public.registration_refund_details r where r.order_id = o.id),
    'payment', public.registration_payment_options(ev),
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$$;

-- No walk-ins at a cancelled event.
create or replace function public.registration_walk_in(p_event uuid, p_order jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  v_name text := btrim(coalesce(p_order ->> 'name', ''));
  v_email text := nullif(lower(btrim(coalesce(p_order ->> 'email', ''))), '');
  v_phone text := nullif(btrim(coalesce(p_order ->> 'phone', '')), '');
  v_date uuid := nullif(p_order ->> 'date_id', '')::uuid;
  v_paid boolean := coalesce((p_order ->> 'paid')::boolean, false);
  v_here boolean := coalesce((p_order ->> 'checked_in')::boolean, true);
  line jsonb;
  tt public.registration_ticket_types%rowtype;
  qty int;
  unit int;
  names jsonb;
  i int;
  total_qty int := 0;
  subtotal int := 0;
  order_id uuid := gen_random_uuid();
  v_code text;
  seen uuid[] := '{}';
begin
  if not public.registration_may_work(auth.uid()) then
    raise exception 'Only whoever runs registrations or works the door may register somebody here.';
  end if;
  select * into ev from public.registration_events where id = p_event for update;
  if not found or ev.status = 'draft' or ev.cancelled_at is not null then raise exception 'That event is not taking registrations.'; end if;
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'Give their name.'; end if;
  if v_email is not null and (v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254) then
    raise exception 'That email address does not look right.';
  end if;
  if v_phone is not null and length(v_phone) > 40 then raise exception 'That phone number is too long.'; end if;
  if ev.date_mode = 'choose' then
    if v_date is null or not exists (select 1 from public.registration_event_dates d where d.id = v_date and d.event_id = ev.id) then
      raise exception 'Choose which date they are here for.';
    end if;
  else
    v_date := null;
  end if;
  if jsonb_typeof(p_order -> 'lines') <> 'array' or jsonb_array_length(p_order -> 'lines') = 0 then
    raise exception 'Choose at least one ticket.';
  end if;

  perform 1 from public.registration_ticket_types where event_id = ev.id for update;

  insert into public.registration_orders
    (id, code, event_id, date_id, name, email, phone, quantity, payment_status, payment_method, source)
  values
    (order_id, public.registration_new_code(), ev.id, v_date, v_name, v_email, v_phone, 1, 'not_needed', 'reception', 'walk_in')
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
    unit := case tt.kind when 'free' then 0 when 'paid' then tt.price_pence else coalesce((line ->> 'donation_pence')::int, 0) end;
    if unit < 0 or unit > 1000000 then raise exception 'That amount is not right.'; end if;
    names := case when jsonb_typeof(line -> 'attendee_names') = 'array' then line -> 'attendee_names' else '[]'::jsonb end;
    for i in 1..qty loop
      insert into public.registration_order_tickets (order_id, ticket_type_id, attendee_name, unit_price_pence)
      values (order_id, tt.id, nullif(left(btrim(coalesce(names ->> (i - 1), '')), 120), ''), unit);
    end loop;
    perform public.registration_sold_out_notify(ev.id, tt.id, v_date);
    total_qty := total_qty + qty;
    subtotal := subtotal + unit * qty;
  end loop;
  if total_qty = 0 then raise exception 'Choose at least one ticket.'; end if;

  update public.registration_orders
  set quantity = total_qty,
      subtotal_pence = subtotal,
      total_pence = subtotal,
      payment_status = case when subtotal = 0 then 'not_needed' when v_paid then 'received' else 'awaiting' end,
      received_at = case when subtotal > 0 and v_paid then now() end,
      received_by = case when subtotal > 0 and v_paid then auth.uid() end,
      checked_in_at = case when v_here then now() end,
      checked_in_by = case when v_here then auth.uid() end
  where id = order_id;

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;
