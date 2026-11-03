-- Reception (asked for by the Owner after the first real event).
--
-- Three things a church needs at the door that the first four parts left
-- out, and the proof-of-payment flow that goes with them:
--
--   1. People who may work the door without being able to change events:
--      `reg.door` ("Work the door") in the grid — scan tickets, take money
--      at reception, check people in, register somebody who turns up
--      having done nothing online. The Reception page (/door) opens to the
--      Owner, to `reg.manage` and to `reg.door`. Reading the events and
--      their orders widens to both; writing to events stays `reg.manage`.
--
--   2. Walk-ins: registration_walk_in() makes an order at the door — no
--      registration window, no trap field, no cap per address, an email
--      address optional (so `registration_orders.email` is now nullable;
--      the public registration still requires one) — paid at reception or
--      still owing, checked in or not, with the same capacity check under
--      the same lock as an online order. `source` says which way an order
--      came.
--
--   3. Proof of an online payment: a receipt (screenshot or PDF) in the
--      private registration-proofs bucket, or a typed reference, or both.
--      Anybody with the ticket's code may put a receipt under that code —
--      the order has to be live and still owing, which
--      registration_proof_allowed() checks past the table's own rules —
--      and only the door and the office may read it back.
--      registration_order_payment() takes the proof and marks the order
--      reported; registration_order_mark() now records who marked a
--      payment received or waived, and when. The pages send the "your
--      ticket is confirmed" email from there.

-- ---------------------------------------------------------------------
-- Work the door: the grid
-- ---------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('reg.door', 'admin', '{none,all}', 'none'),
  ('reg.door', 'head', '{none,all}', 'none'),
  ('reg.door', 'assistant', '{none,all}', 'none'),
  ('reg.door', 'coordinator', '{none,all}', 'none'),
  ('reg.door', 'member', '{none,all}', 'none'),
  ('reg.door', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

/** Whoever may run registrations or work the door. */
create or replace function public.registration_may_work(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.may(uid, 'reg.manage') or public.may(uid, 'reg.door')
$$;
revoke all on function public.registration_may_work(uuid) from public, anon;
grant execute on function public.registration_may_work(uuid) to authenticated;

drop policy if exists registration_events_select on public.registration_events;
create policy registration_events_select on public.registration_events
  for select using ((select public.registration_may_work((select auth.uid()))));
drop policy if exists registration_event_dates_select on public.registration_event_dates;
create policy registration_event_dates_select on public.registration_event_dates
  for select using ((select public.registration_may_work((select auth.uid()))));
drop policy if exists registration_ticket_types_select on public.registration_ticket_types;
create policy registration_ticket_types_select on public.registration_ticket_types
  for select using ((select public.registration_may_work((select auth.uid()))));
drop policy if exists registration_orders_select on public.registration_orders;
create policy registration_orders_select on public.registration_orders
  for select using ((select public.registration_may_work((select auth.uid()))));
drop policy if exists registration_order_tickets_select on public.registration_order_tickets;
create policy registration_order_tickets_select on public.registration_order_tickets
  for select using ((select public.registration_may_work((select auth.uid()))));

-- ---------------------------------------------------------------------
-- The order: where it came from, who took the money, the proof
-- ---------------------------------------------------------------------

alter table public.registration_orders alter column email drop not null;
alter table public.registration_orders
  add column if not exists source text not null default 'online' check (source in ('online', 'walk_in')),
  add column if not exists proof_path text check (proof_path is null or length(proof_path) <= 300),
  add column if not exists proof_reference text check (proof_reference is null or length(proof_reference) <= 120),
  add column if not exists proof_at timestamptz,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references public.profiles (id) on delete set null;
comment on column public.registration_orders.source is 'online: registered from the public page; walk_in: made at the door by reception.';
comment on column public.registration_orders.proof_path is 'A receipt in the registration-proofs bucket, under the order''s code.';

-- ---------------------------------------------------------------------
-- The receipts: a private bucket, written under the ticket's own code
-- ---------------------------------------------------------------------

/** May a receipt be put at this path: a live order, still owing, on a published event. */
create or replace function public.registration_proof_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registration_orders o
    join public.registration_events e on e.id = o.event_id
    where o.code = split_part(p_name, '/', 1)
      and p_name ~ '^[A-Z0-9]{12}/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|pdf)$'
      and o.status = 'confirmed'
      and o.payment_status in ('awaiting', 'reported')
      and e.status <> 'draft'
  )
$$;
revoke all on function public.registration_proof_allowed(text) from public;
grant execute on function public.registration_proof_allowed(text) to anon, authenticated;

do $buckets$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('registration-proofs', 'registration-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
    on conflict (id) do update
      set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists registration_proofs_insert on storage.objects;
    drop policy if exists registration_proofs_select on storage.objects;
    drop policy if exists registration_proofs_delete on storage.objects;
    create policy registration_proofs_insert on storage.objects
      for insert with check (bucket_id = 'registration-proofs' and public.registration_proof_allowed(name));
    create policy registration_proofs_select on storage.objects
      for select using (bucket_id = 'registration-proofs' and public.registration_may_work(auth.uid()));
    create policy registration_proofs_delete on storage.objects
      for delete using (bucket_id = 'registration-proofs' and public.may(auth.uid(), 'reg.manage'));
  end if;
end $buckets$;

-- ---------------------------------------------------------------------
-- The attendee says they paid, with the proof
-- ---------------------------------------------------------------------

drop function if exists public.registration_order_payment(text, text, boolean);
create or replace function public.registration_order_payment(
  p_code text,
  p_method text,
  p_done boolean,
  p_proof_path text default null,
  p_reference text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  ev public.registration_events%rowtype;
  ref text := nullif(left(btrim(coalesce(p_reference, '')), 120), '');
  proof text := nullif(btrim(coalesce(p_proof_path, '')), '');
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code)) for update;
  if not found or o.status <> 'confirmed' then raise exception 'That ticket is not open.'; end if;
  if o.payment_status not in ('awaiting', 'reported') then raise exception 'This order does not need a payment.'; end if;
  if p_method not in ('paypal', 'bank', 'reception') then raise exception 'Choose how you are paying.'; end if;
  select * into ev from public.registration_events where id = o.event_id;
  if p_method = 'reception' and not ev.allow_pay_at_reception then raise exception 'Paying at reception is not offered for this event.'; end if;
  -- A receipt may only sit under this order's own code.
  if proof is not null and proof !~ ('^' || o.code || '/') then raise exception 'That receipt is not for this ticket.'; end if;
  if p_method <> 'reception' and p_done and proof is null and ref is null then
    raise exception 'Attach the receipt, or type the payment reference, so the church can match it.';
  end if;

  update public.registration_orders
  set payment_method = p_method,
      payment_status = case when p_method <> 'reception' and p_done then 'reported' else 'awaiting' end,
      proof_path = case when p_method <> 'reception' and p_done then coalesce(proof, proof_path) else proof_path end,
      proof_reference = case when p_method <> 'reception' and p_done then coalesce(ref, proof_reference) else proof_reference end,
      proof_at = case when p_method <> 'reception' and p_done then now() else proof_at end
  where id = o.id;
end;
$$;
revoke all on function public.registration_order_payment(text, text, boolean, text, text) from public;
grant execute on function public.registration_order_payment(text, text, boolean, text, text) to anon, authenticated;

-- The ticket page learns whether a receipt is in.
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
      'slug', ev.slug, 'title', ev.title, 'image_path', ev.image_path, 'status', ev.status, 'date_mode', ev.date_mode,
      'location', jsonb_build_object('name', ev.location_name, 'address', ev.address, 'latitude', ev.latitude, 'longitude', ev.longitude),
      'allow_pay_at_reception', ev.allow_pay_at_reception,
      'payment_note', ev.payment_note,
      'dates', (
        select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label)
                                  order by d.starts_at, d.sort_order), '[]'::jsonb)
        from public.registration_event_dates d where d.event_id = ev.id
      )
    ),
    'payment', public.registration_payment_options(ev),
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Acting on an order: the door may check in and take money, no more
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

  if p_action in ('received', 'waived') then
    if o.payment_status = 'not_needed' then raise exception 'There is nothing to pay on this registration.'; end if;
    update public.registration_orders
    set payment_status = p_action, received_at = now(), received_by = auth.uid(),
        payment_method = coalesce(payment_method, 'reception')
    where id = p_id;
  elsif p_action = 'awaiting' then
    if o.payment_status = 'not_needed' then raise exception 'There is nothing to pay on this registration.'; end if;
    update public.registration_orders set payment_status = 'awaiting', received_at = null, received_by = null where id = p_id;
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

-- ---------------------------------------------------------------------
-- Somebody at the door who did nothing online
-- ---------------------------------------------------------------------

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
  if not found or ev.status = 'draft' then raise exception 'That event is not taking registrations.'; end if;
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
revoke all on function public.registration_walk_in(uuid, jsonb) from public, anon;
grant execute on function public.registration_walk_in(uuid, jsonb) to authenticated;
