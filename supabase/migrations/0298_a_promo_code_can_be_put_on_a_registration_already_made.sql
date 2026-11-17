/*
 * 0298 — a promo code can be put on a registration that is already made
 *
 * People who were meant to use a code registered without it, were asked
 * for the money, and then registered again under the same address with
 * the code. That left two registrations for one person: a free ticket,
 * and a place held with a payment that would never come. The only tools
 * were to waive the unpaid one — which counted it as money received and
 * left them holding two tickets — or to cancel it by hand, once somebody
 * noticed.
 *
 * The better answer is that the first registration never needed a
 * second. A code can now be put on a registration after the fact, by
 * either side:
 *
 *   the church    registration_order_apply_promo(order, code) — the
 *                 "Approve payments" right (`registration_can(uid,
 *                 'approve')`), which is who may already waive one.
 *                 One more thing Undo puts back (0281).
 *   the attendee  registration_order_promo(ticket code, promo code) —
 *                 from their own ticket page, which they hold the code
 *                 to, exactly as registering with the code would have
 *                 been open to them. `registration_order_view` says
 *                 `can_use_promo` so the page offers it only where it
 *                 would be taken.
 *
 * Both are one inner function, registration_apply_promo(), which only
 * definer code may call. It takes a registration that is live, on an
 * event that is not cancelled, still awaiting its payment, with no code,
 * invitation or discount on it yet; and a code that is the event's,
 * active, with a use left. It works the discount out on the
 * registration's own tickets at the prices they were registered at —
 * the same sum as registration_register(): the ticket types the code is
 * for, as many tickets as it covers (0296), the dearest first, rounded
 * the same way — writes the new total, counts the code as used, and, if
 * nothing is left to pay, makes the registration a ticket. A code that
 * would take nothing off is refused rather than spent.
 *
 * A registration with a payment already recorded (reported, received,
 * waived) is not touched: the office puts it back to awaiting payment
 * first, which is a decision, not a side effect.
 *
 * Undo. `registration_order_state()` — what Undo restores and compares —
 * gains the discount, the total and the code, so taking back the press
 * puts the price back as it was; and registration_order_undo() gives the
 * code its use back. A memory written before this migration has none of
 * those keys: Undo leaves those columns alone for it, rather than
 * blanking a total.
 *
 * Compatible with the app in production: every change adds, and it takes
 * an answer with a key it does not know.
 */

-- ---------------------------------------------------------------------------
-- 1. Putting a code on a registration: the one place it is done.
--    Returns {"ok": true, "discount_pence", "total_pence"}; every refusal is
--    an exception with a sentence the page can show.
-- ---------------------------------------------------------------------------
create or replace function public.registration_apply_promo(p_order uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  ev public.registration_events%rowtype;
  promo public.registration_promo_codes%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  discountable int;
  discount int;
begin
  select * into o from public.registration_orders where id = p_order for update;
  if not found then raise exception 'No such registration.'; end if;
  select * into ev from public.registration_events where id = o.event_id;
  if o.status <> 'confirmed' then raise exception 'This registration was cancelled.'; end if;
  if ev.cancelled_at is not null then raise exception 'This event was cancelled.'; end if;
  if o.promo_code is not null or o.promo_code_id is not null or o.invite_id is not null or o.discount_pence > 0 then
    raise exception 'This registration already has a discount.';
  end if;
  if o.payment_status = 'not_needed' or o.total_pence <= 0 then
    raise exception 'There is nothing to pay on this registration.';
  end if;
  if o.payment_status <> 'awaiting' then
    raise exception 'A payment has already been recorded on this registration.';
  end if;

  select * into promo from public.registration_promo_codes p
  where p.event_id = o.event_id and p.code = v_code and p.active
    and (p.max_uses is null or p.uses < p.max_uses)
  for update;
  if not found then raise exception 'That promo code is not valid.'; end if;

  -- The same sum as registering with it: the paid tickets it is for, at the
  -- price each was registered at, as many as it covers (null: all of them),
  -- the dearest first.
  select coalesce(sum(x.price), 0)::int into discountable
  from (
    select t.unit_price_pence as price
    from public.registration_order_tickets t
    join public.registration_ticket_types tt on tt.id = t.ticket_type_id
    where t.order_id = o.id and tt.kind = 'paid'
      and (cardinality(promo.ticket_type_ids) = 0 or tt.id = any (promo.ticket_type_ids))
    order by t.unit_price_pence desc
    limit promo.tickets_covered
  ) x;
  discount := case promo.kind
    when 'amount' then least(promo.value, discountable)
    else (discountable * promo.value / 100.0)::int
  end;
  -- Nothing off: say so, and do not spend one of the code's uses on it.
  if discount <= 0 then
    raise exception 'That code takes nothing off the tickets on this registration.';
  end if;

  update public.registration_orders
  set discount_pence = discount,
      total_pence = subtotal_pence - discount,
      promo_code = promo.code,
      promo_code_id = promo.id,
      payment_status = case when subtotal_pence - discount > 0 then 'awaiting' else 'not_needed' end,
      -- Nothing left to pay: how they had meant to pay no longer says anything.
      payment_method = case when subtotal_pence - discount > 0 then payment_method else null end
  where id = o.id;
  update public.registration_promo_codes set uses = uses + 1 where id = promo.id;

  return jsonb_build_object('ok', true, 'discount_pence', discount, 'total_pence', o.subtotal_pence - discount);
end;
$$;
revoke all on function public.registration_apply_promo(uuid, text) from public, anon, authenticated;

-- The church: whoever may approve payments.
create or replace function public.registration_order_apply_promo(p_id uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.registration_can(auth.uid(), 'approve') then
    raise exception 'Approving payments is not one of your rights here.' using errcode = '42501';
  end if;
  return public.registration_apply_promo(p_id, p_code);
end;
$$;
revoke all on function public.registration_order_apply_promo(uuid, text) from public, anon;
grant execute on function public.registration_order_apply_promo(uuid, text) to authenticated;

-- The attendee: whoever holds the ticket's code, as registering was open to them.
create or replace function public.registration_order_promo(p_code text, p_promo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.registration_orders where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'No such ticket.'; end if;
  return public.registration_apply_promo(v_id, p_promo);
end;
$$;
revoke all on function public.registration_order_promo(text, text) from public;
grant execute on function public.registration_order_promo(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The ticket: registration_order_view() as it stood (0296), saying whether a
--    code can still be put on it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_order_view(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- The code itself is not handed back (0296): a ticket is a page people
    -- pass on. The key stays, null; `promo` says whether there was one.
    'promo_code', null::text,
    'promo', o.promo_code is not null,
    -- A code can still be put on it (0298): live, awaiting its payment, no
    -- discount yet, and the event has a code with a use left. Never null.
    'can_use_promo', coalesce(
      o.status = 'confirmed' and ev.cancelled_at is null and o.payment_status = 'awaiting' and o.total_pence > 0
      and o.promo_code is null and o.promo_code_id is null and o.invite_id is null and o.discount_pence = 0
      and exists (select 1 from public.registration_promo_codes p
                  where p.event_id = ev.id and p.active and (p.max_uses is null or p.uses < p.max_uses)),
      false),
    -- Came by an invitation link (0295): the ticket says so, and never the token.
    'invited', o.invite_id is not null,
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
    -- What became of the email to the address above (0283).
    'email_state', case
      when o.email is null or o.anonymised_at is not null then 'none'
      when public.registration_email_bounced(o.email_status) then 'bounced'
      when o.email_status in ('delivered', 'complained') then 'delivered'
      when o.email_status in ('sent', 'delayed') then 'waiting'
      else 'none'
    end,
    'email_can_fix', o.status = 'confirmed' and o.anonymised_at is null
                     and public.registration_email_bounced(o.email_status) and o.email_fixes < 3,
    'payment', public.registration_payment_options(ev),
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. What Undo restores and compares: registration_order_state() as it stood
--    (0283), with the price and the code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_order_state(o registration_orders)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'status', o.status,
    'cancelled_at', o.cancelled_at,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'received_at', o.received_at,
    'received_by', o.received_by,
    'checked_in_at', o.checked_in_at,
    'checked_in_by', o.checked_in_by,
    'refund_status', o.refund_status,
    'refund_at', o.refund_at,
    'refund_by', o.refund_by,
    'payment_verified_at', o.payment_verified_at,
    'payment_verified_by', o.payment_verified_by,
    'notes', o.notes,
    'email', o.email,
    -- What a promo code put on afterwards moves (0298).
    'discount_pence', o.discount_pence,
    'total_pence', o.total_pence,
    'promo_code', o.promo_code,
    'promo_code_id', o.promo_code_id
  );
$function$;

-- ---------------------------------------------------------------------------
-- 4. What a change is called: registration_orders_remember() as it stood (0281),
--    naming a promo code put on.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_orders_remember()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  was jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else public.registration_order_state(old) end;
  became jsonb := public.registration_order_state(new);
  word text;
begin
  -- The undo itself is not something to undo.
  if coalesce(current_setting('rim.registration_undoing', true), '') = '1' then
    return null;
  end if;
  -- Nothing a press changes moved: an email stamped, what Resend said of it.
  if tg_op = 'UPDATE' and was = became then
    return null;
  end if;
  if tg_op = 'INSERT' then
    -- Only an order made at the door by one of us. One made by the attendee is not ours to undo.
    if me is null or new.source is distinct from 'walk_in' then
      return null;
    end if;
  elsif me is null or not public.registration_may_work(me) then
    delete from public.registration_order_undos u where u.order_id = new.id;
    return null;
  end if;

  word := case
    when tg_op = 'INSERT' then 'registered'
    when (was ->> 'status') is distinct from (became ->> 'status') then
      case when became ->> 'status' = 'cancelled' then 'cancelled' else 'put back' end
    when (was ->> 'refund_status') is distinct from (became ->> 'refund_status') then 'refund'
    when (was ->> 'promo_code') is distinct from (became ->> 'promo_code') then 'promo code'
    when (was ->> 'payment_status') is distinct from (became ->> 'payment_status') then 'payment'
    when (was ->> 'checked_in_at') is distinct from (became ->> 'checked_in_at') then 'check-in'
    when (was ->> 'payment_verified_at') is distinct from (became ->> 'payment_verified_at') then 'verification'
    when (was ->> 'notes') is distinct from (became ->> 'notes') then 'note'
    when (was ->> 'email') is distinct from (became ->> 'email') then 'email address'
    else 'change'
  end;

  insert into public.registration_order_undos as u (order_id, done_by, done_at, what, was, became)
  values (new.id, me, now(), word, was, became)
  on conflict (order_id) do update set
    -- The same person in the same transaction: one thing done, in steps.
    -- Keep where it started and what it was called; move where it ended.
    was = case when u.done_by = excluded.done_by and u.done_at = excluded.done_at then u.was else excluded.was end,
    what = case when u.done_by = excluded.done_by and u.done_at = excluded.done_at then u.what else excluded.what end,
    refund_details = case when u.done_by = excluded.done_by and u.done_at = excluded.done_at then u.refund_details end,
    became = excluded.became,
    done_by = excluded.done_by,
    done_at = excluded.done_at;
  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Undo: registration_order_undo() as it stood (0296), putting the price back
--    and giving the code its use back.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_order_undo(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  me uuid := auth.uid();
  o public.registration_orders%rowtype;
  u public.registration_order_undos%rowtype;
  ev public.registration_events%rowtype;
  tt public.registration_ticket_types%rowtype;
  line record;
  address_back boolean;
begin
  if me is null or not public.registration_may_work(me) then
    raise exception 'Undoing is for whoever works registrations.' using errcode = '42501';
  end if;
  select * into o from public.registration_orders where id = p_id for update;
  if not found then
    raise exception 'That registration is not there any more.' using errcode = 'P0002';
  end if;
  select * into u from public.registration_order_undos where order_id = p_id;
  if not found then
    raise exception 'There is nothing to undo on this registration.';
  end if;
  if u.done_by <> me then
    raise exception 'That was somebody else''s change. Only they can undo it; use the menu to put it right.';
  end if;
  if u.done_at < now() - interval '10 minutes' then
    raise exception 'That was too long ago to undo. Use the menu to put it right.';
  end if;
  if public.registration_order_state(o) is distinct from u.became then
    raise exception 'This registration has changed since. Use the menu to put it right.';
  end if;

  perform set_config('rim.registration_undoing', '1', true);

  if u.was = '{}'::jsonb then
    -- It was made by the press: unmade.
    delete from public.registration_orders where id = p_id;
  else
    -- Coming back from cancelled, its places must still be there, as Put back checks (0245).
    if u.was ->> 'status' = 'confirmed' and o.status <> 'confirmed' then
      select * into ev from public.registration_events where id = o.event_id;
      if ev.cancelled_at is not null then
        perform set_config('rim.registration_undoing', '', true);
        raise exception 'This event was cancelled.';
      end if;
      perform 1 from public.registration_ticket_types where event_id = o.event_id for update;
      for line in
        select t.ticket_type_id, count(*)::int as n from public.registration_order_tickets t where t.order_id = o.id group by 1
      loop
        select * into tt from public.registration_ticket_types where id = line.ticket_type_id;
        if tt.quantity is not null and public.registration_sold(tt.id, o.date_id) + line.n > tt.quantity then
          perform set_config('rim.registration_undoing', '', true);
          raise exception 'Not enough "%" left to put this registration back.', tt.name;
        end if;
      end loop;
      -- …and so must the use of the invitation it came by, as Put back checks (0296).
      if o.invite_id is not null then
        perform 1 from public.registration_invites i where i.id = o.invite_id for update;
        if exists (select 1 from public.registration_invites i
                   where i.id = o.invite_id and i.max_uses is not null
                     and public.registration_invite_uses(i.id) >= i.max_uses) then
          perform set_config('rim.registration_undoing', '', true);
          raise exception 'The invite link this registration came by has been used again since, and has no uses left. Register them again instead.';
        end if;
      end if;
    end if;

    -- A promo code the press put on (0298): the code gets its use back.
    if (u.was ? 'promo_code_id') and (u.was ->> 'promo_code_id') is null and o.promo_code_id is not null then
      update public.registration_promo_codes set uses = greatest(uses - 1, 0) where id = o.promo_code_id;
    end if;

    -- The address moved in what is being undone (0283).
    address_back := (u.was ? 'email') and (u.was ->> 'email') is distinct from o.email;

    update public.registration_orders t
       set status = b.status,
           cancelled_at = b.cancelled_at,
           payment_status = b.payment_status,
           payment_method = b.payment_method,
           received_at = b.received_at,
           received_by = b.received_by,
           checked_in_at = b.checked_in_at,
           checked_in_by = b.checked_in_by,
           refund_status = b.refund_status,
           refund_at = b.refund_at,
           refund_by = b.refund_by,
           payment_verified_at = b.payment_verified_at,
           payment_verified_by = b.payment_verified_by,
           notes = b.notes,
           -- The price and the code (0298) — only from a memory that holds them:
           -- one written before 0298 has no such keys, and must not blank a total.
           discount_pence = case when u.was ? 'total_pence' then b.discount_pence else t.discount_pence end,
           total_pence = case when u.was ? 'total_pence' then b.total_pence else t.total_pence end,
           promo_code = case when u.was ? 'total_pence' then b.promo_code else t.promo_code end,
           promo_code_id = case when u.was ? 'total_pence' then b.promo_code_id else t.promo_code_id end,
           email = case when address_back then b.email else t.email end,
           email_sent_at = case when address_back then (t.email_before ->> 'email_sent_at')::timestamptz else t.email_sent_at end,
           email_ref = case when address_back then (t.email_before ->> 'email_ref')::uuid else t.email_ref end,
           email_status = case when address_back then t.email_before ->> 'email_status' else t.email_status end,
           email_status_at = case when address_back then (t.email_before ->> 'email_status_at')::timestamptz else t.email_status_at end,
           email_status_detail = case when address_back then t.email_before ->> 'email_status_detail' else t.email_status_detail end,
           email_changed_at = case when address_back then (t.email_before ->> 'email_changed_at')::timestamptz else t.email_changed_at end,
           email_changed_by = case when address_back then (t.email_before ->> 'email_changed_by')::uuid else t.email_changed_by end,
           email_before = case
             when not address_back then t.email_before
             when t.email_before ->> 'was' is null then null
             else jsonb_build_object('email', t.email_before ->> 'was')
           end
      from jsonb_populate_record(null::public.registration_orders, u.was) b
     where t.id = p_id;

    if u.refund_details is not null then
      insert into public.registration_refund_details
      select (jsonb_populate_record(null::public.registration_refund_details, u.refund_details)).*
      on conflict (order_id) do nothing;
    end if;
  end if;

  delete from public.registration_order_undos where order_id = p_id;
  perform set_config('rim.registration_undoing', '', true);
  return u.what;
end;
$function$;
select public.migration_done(298, '0298_a_promo_code_can_be_put_on_a_registration_already_made', '11fb4bc7b811adba6f444fc8d5fcc21365778a0f75d21f488a8d4b1d4ecb68b2');
