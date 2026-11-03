-- Separate rights for registrations and the door (asked for by the Owner).
--
-- "Run registrations" (reg.manage) and "Work the door" (reg.door) were two
-- lumps. Now each part of the work is its own cell in Access & Privileges:
--
--   office  reg.view     View & export: the events, who registered, the export
--           reg.edit     Make & edit events: details, dates, tickets, promo
--                        codes, the picture, publishing and closing
--           reg.approve  Approve payments: mark received, waive, ask again
--           reg.refund   Refunds: see where to send one, mark it refunded
--           reg.cancel   Cancel & delete: cancel orders and events, delete an
--                        event once nothing is owed
--   door    reg.door     Check people in (the old "Work the door")
--           reg.door_pay Take payments at the door (and check in)
--           reg.walk_in  Register walk-ins (and check in)
--
-- reg.manage stays "all of it" — everybody who has it keeps everything they
-- had — except deleting an event, which is the Owner's and reg.cancel's.
-- Every check goes through registration_can(uid, what), so the rule for a
-- right lives in one place. Notes move to registration_order_note(): the
-- orders table itself is now written only by reg.manage.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('reg.view', 'admin', '{none,all}', 'none'),
  ('reg.view', 'head', '{none,all}', 'none'),
  ('reg.view', 'assistant', '{none,all}', 'none'),
  ('reg.view', 'coordinator', '{none,all}', 'none'),
  ('reg.view', 'member', '{none,all}', 'none'),
  ('reg.view', 'newcomer', '{none}', 'none'),
  ('reg.edit', 'admin', '{none,all}', 'none'),
  ('reg.edit', 'head', '{none,all}', 'none'),
  ('reg.edit', 'assistant', '{none,all}', 'none'),
  ('reg.edit', 'coordinator', '{none,all}', 'none'),
  ('reg.edit', 'member', '{none,all}', 'none'),
  ('reg.edit', 'newcomer', '{none}', 'none'),
  ('reg.approve', 'admin', '{none,all}', 'none'),
  ('reg.approve', 'head', '{none,all}', 'none'),
  ('reg.approve', 'assistant', '{none,all}', 'none'),
  ('reg.approve', 'coordinator', '{none,all}', 'none'),
  ('reg.approve', 'member', '{none,all}', 'none'),
  ('reg.approve', 'newcomer', '{none}', 'none'),
  ('reg.refund', 'admin', '{none,all}', 'none'),
  ('reg.refund', 'head', '{none,all}', 'none'),
  ('reg.refund', 'assistant', '{none,all}', 'none'),
  ('reg.refund', 'coordinator', '{none,all}', 'none'),
  ('reg.refund', 'member', '{none,all}', 'none'),
  ('reg.refund', 'newcomer', '{none}', 'none'),
  ('reg.cancel', 'admin', '{none,all}', 'none'),
  ('reg.cancel', 'head', '{none,all}', 'none'),
  ('reg.cancel', 'assistant', '{none,all}', 'none'),
  ('reg.cancel', 'coordinator', '{none,all}', 'none'),
  ('reg.cancel', 'member', '{none,all}', 'none'),
  ('reg.cancel', 'newcomer', '{none}', 'none'),
  ('reg.door_pay', 'admin', '{none,all}', 'none'),
  ('reg.door_pay', 'head', '{none,all}', 'none'),
  ('reg.door_pay', 'assistant', '{none,all}', 'none'),
  ('reg.door_pay', 'coordinator', '{none,all}', 'none'),
  ('reg.door_pay', 'member', '{none,all}', 'none'),
  ('reg.door_pay', 'newcomer', '{none}', 'none'),
  ('reg.walk_in', 'admin', '{none,all}', 'none'),
  ('reg.walk_in', 'head', '{none,all}', 'none'),
  ('reg.walk_in', 'assistant', '{none,all}', 'none'),
  ('reg.walk_in', 'coordinator', '{none,all}', 'none'),
  ('reg.walk_in', 'member', '{none,all}', 'none'),
  ('reg.walk_in', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

/** May this person do this part of registrations? The one place the rights are decided. */
create or replace function public.registration_can(uid uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case what
    -- Opening the Registrations page, reading its events and orders.
    when 'office' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                    or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
    -- Opening Reception.
    when 'door' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                  or public.may(uid, 'reg.walk_in')
    -- Reading the rows at all: either of those.
    when 'work' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                  or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
                  or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay') or public.may(uid, 'reg.walk_in')
    when 'edit' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.edit')
    when 'approve' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
    when 'take_payment' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve') or public.may(uid, 'reg.door_pay')
    when 'refund' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.refund')
    when 'cancel' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.cancel')
    when 'delete' then exists (select 1 from public.app_owner where user_id = uid) or public.may(uid, 'reg.cancel')
    when 'check_in' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                      or public.may(uid, 'reg.walk_in')
    when 'walk_in' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.walk_in')
    else false
  end
$$;
revoke all on function public.registration_can(uuid, text) from public, anon;
grant execute on function public.registration_can(uuid, text) to authenticated;

-- Reading the rows (0247's helper, now any right of either kind).
create or replace function public.registration_may_work(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.registration_can(uid, 'work')
$$;

-- ---------------------------------------------------------------------
-- Writing: each table to the right that does it
-- ---------------------------------------------------------------------

drop policy if exists registration_events_insert on public.registration_events;
create policy registration_events_insert on public.registration_events
  for insert with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_events_update on public.registration_events;
create policy registration_events_update on public.registration_events
  for update using ((select public.registration_can((select auth.uid()), 'edit')))
  with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_event_dates_insert on public.registration_event_dates;
create policy registration_event_dates_insert on public.registration_event_dates
  for insert with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_event_dates_update on public.registration_event_dates;
create policy registration_event_dates_update on public.registration_event_dates
  for update using ((select public.registration_can((select auth.uid()), 'edit')))
  with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_ticket_types_insert on public.registration_ticket_types;
create policy registration_ticket_types_insert on public.registration_ticket_types
  for insert with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_ticket_types_update on public.registration_ticket_types;
create policy registration_ticket_types_update on public.registration_ticket_types
  for update using ((select public.registration_can((select auth.uid()), 'edit')))
  with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_promo_codes_insert on public.registration_promo_codes;
create policy registration_promo_codes_insert on public.registration_promo_codes
  for insert with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_promo_codes_update on public.registration_promo_codes;
create policy registration_promo_codes_update on public.registration_promo_codes
  for update using ((select public.registration_can((select auth.uid()), 'edit')))
  with check ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_event_dates_delete on public.registration_event_dates;
create policy registration_event_dates_delete on public.registration_event_dates
  for delete using ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_ticket_types_delete on public.registration_ticket_types;
create policy registration_ticket_types_delete on public.registration_ticket_types
  for delete using ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_promo_codes_delete on public.registration_promo_codes;
create policy registration_promo_codes_delete on public.registration_promo_codes
  for delete using ((select public.registration_can((select auth.uid()), 'edit')));
drop policy if exists registration_events_delete on public.registration_events;
create policy registration_events_delete on public.registration_events
  for delete using ((select public.registration_can((select auth.uid()), 'delete')));
drop policy if exists registration_promo_codes_select on public.registration_promo_codes;
create policy registration_promo_codes_select on public.registration_promo_codes
  for select using ((select public.registration_can((select auth.uid()), 'office')));
drop policy if exists registration_orders_update on public.registration_orders;
create policy registration_orders_update on public.registration_orders
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
drop policy if exists registration_orders_delete on public.registration_orders;
create policy registration_orders_delete on public.registration_orders
  for delete using ((select public.registration_can((select auth.uid()), 'delete')));
drop policy if exists registration_order_tickets_update on public.registration_order_tickets;
create policy registration_order_tickets_update on public.registration_order_tickets
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
drop policy if exists registration_order_tickets_delete on public.registration_order_tickets;
create policy registration_order_tickets_delete on public.registration_order_tickets
  for delete using ((select public.registration_can((select auth.uid()), 'delete')));
drop policy if exists registration_refund_details_select on public.registration_refund_details;
create policy registration_refund_details_select on public.registration_refund_details
  for select using ((select public.registration_can((select auth.uid()), 'refund')));

do $buckets$
begin
  if to_regclass('storage.buckets') is not null then
    drop policy if exists registration_images_insert on storage.objects;
    drop policy if exists registration_images_update on storage.objects;
    drop policy if exists registration_images_delete on storage.objects;
    create policy registration_images_insert on storage.objects
      for insert with check (bucket_id = 'registration-images' and public.registration_can(auth.uid(), 'edit'));
    create policy registration_images_update on storage.objects
      for update using (bucket_id = 'registration-images' and public.registration_can(auth.uid(), 'edit'));
    create policy registration_images_delete on storage.objects
      for delete using (bucket_id = 'registration-images' and public.registration_can(auth.uid(), 'edit'));
  end if;
end $buckets$;

-- A note on an order: anybody in the office.
create or replace function public.registration_order_note(p_id uuid, p_notes text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.registration_can(auth.uid(), 'office') then
    raise exception 'Notes are for whoever runs registrations.' using errcode = '42501';
  end if;
  update public.registration_orders set notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), '') where id = p_id;
end;
$$;
revoke all on function public.registration_order_note(uuid, text) from public, anon;
grant execute on function public.registration_order_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- The functions, each asking for its own right
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
  need text := case p_action
    when 'received' then 'take_payment'
    when 'waived' then 'approve'
    when 'awaiting' then 'approve'
    when 'check_in' then 'check_in'
    when 'undo_check_in' then 'check_in'
    when 'cancel' then 'cancel'
    when 'restore' then 'cancel'
    when 'refunded' then 'refund'
  end;
begin
  if need is null then raise exception 'Unknown action: %', p_action; end if;
  if not public.registration_can(auth.uid(), need) then
    raise exception '%', case need
      when 'take_payment' then 'Taking payments is not one of your rights here.'
      when 'approve' then 'Approving payments is not one of your rights here.'
      when 'check_in' then 'Checking people in is not one of your rights here.'
      when 'cancel' then 'Cancelling is not one of your rights here.'
      else 'Refunds are not one of your rights here.'
    end using errcode = '42501';
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
  if not public.registration_can(auth.uid(), 'walk_in') then
    raise exception 'Registering walk-ins is not one of your rights here.' using errcode = '42501';
  end if;
  if v_paid and not public.registration_can(auth.uid(), 'take_payment') then
    raise exception 'Taking payments is not one of your rights here; register them as still to pay.' using errcode = '42501';
  end if;
  if v_here and not public.registration_can(auth.uid(), 'check_in') then
    raise exception 'Checking people in is not one of your rights here.' using errcode = '42501';
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
  if not public.registration_can(auth.uid(), 'cancel') then
    raise exception 'Cancelling events is not one of your rights here.' using errcode = '42501';
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
  -- DELETE: the Owner, or whoever is given "Cancel & delete" — not "Run
  -- registrations" on its own (maintenance with no signed-in user is let through).
  if auth.uid() is not null and not public.registration_can(auth.uid(), 'delete') then
    raise exception 'Deleting events is not one of your rights here. Cancel it instead.' using errcode = '42501';
  end if;
  return old;
end;
$$;

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
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$$;

create or replace function public.registration_sync_diary(p_event uuid, p_register_url text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  d record;
  tz text := public.church_timezone();
  row_id uuid;
begin
  if not public.registration_can(auth.uid(), 'edit') then
    raise exception 'Running registrations is not open to you.' using errcode = '42501';
  end if;
  select * into ev from public.registration_events where id = p_event;
  if not found then return; end if;

  if not ev.add_to_diary or ev.status <> 'published' then
    delete from public.church_events e
    where e.id in (select diary_event_id from public.registration_event_dates where event_id = ev.id and diary_event_id is not null);
    return;
  end if;

  for d in select * from public.registration_event_dates where event_id = ev.id order by starts_at loop
    row_id := d.diary_event_id;
    if row_id is not null and not exists (select 1 from public.church_events where id = row_id) then
      row_id := null;
    end if;
    if row_id is null then
      insert into public.church_events (title, details, event_date, ends_on, start_time, end_time, location, department_ids, links, created_by)
      values (
        ev.title,
        left(ev.description, 2000),
        (d.starts_at at time zone tz)::date,
        case when d.ends_at is not null and (d.ends_at at time zone tz)::date > (d.starts_at at time zone tz)::date
             then (d.ends_at at time zone tz)::date end,
        (d.starts_at at time zone tz)::time,
        (d.ends_at at time zone tz)::time,
        coalesce(ev.location_name, ev.address),
        '{}',
        jsonb_build_array(jsonb_build_object('label', 'Register', 'url', p_register_url)),
        auth.uid()
      )
      returning id into row_id;
      update public.registration_event_dates set diary_event_id = row_id where id = d.id;
    else
      update public.church_events
      set title = ev.title,
          details = left(ev.description, 2000),
          event_date = (d.starts_at at time zone tz)::date,
          ends_on = case when d.ends_at is not null and (d.ends_at at time zone tz)::date > (d.starts_at at time zone tz)::date
                         then (d.ends_at at time zone tz)::date end,
          start_time = (d.starts_at at time zone tz)::time,
          end_time = (d.ends_at at time zone tz)::time,
          location = coalesce(ev.location_name, ev.address),
          links = jsonb_build_array(jsonb_build_object('label', 'Register', 'url', p_register_url))
      where id = row_id;
    end if;
  end loop;
end;
$$;

create or replace function public.registration_managers()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p where public.registration_can(p.id, 'edit')
$$;
