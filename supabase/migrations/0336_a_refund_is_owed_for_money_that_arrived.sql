-- A refund is owed only for money the church has confirmed arrived.
--
-- Somebody registering for a paid event can say "I have paid" (a bank
-- transfer or PayPal, with a reference they type or a picture of a
-- receipt). That puts the order at `reported`: said to be paid, not yet
-- matched against the account by anybody. Until now `reported` counted as
-- money in, so cancelling such an order listed a refund as owed, and let
-- whoever held its code send bank details for it to be paid into. With no
-- money having arrived at any step, the refund list could carry a payout
-- the church never owed. A security review found it (November 2026, N7)
-- and the Owner chose: only once confirmed.
--
-- Confirmed means the office has marked the payment paid (`received`), or
-- whoever verifies payments has verified a reported one. So:
--
--  * cancelling a registration, by the attendee or by the office, and
--    cancelling an event, owe a refund only where the payment is confirmed;
--  * a registration cancelled while its payment was only reported can
--    still be marked paid, and that is what then owes the refund: the
--    office finds the transfer in the account afterwards, says so, and the
--    refund appears. Nobody has to put a cancelled registration back first;
--  * verifying a reported payment on a cancelled event owes it too.
--
-- Not changed: an event still cannot be deleted while somebody on it says
-- they have paid and has not been refunded (registration_money_in, "in, or
-- said to be"). Losing the record of a payment that did arrive is worse
-- than being asked to look.
--
-- No order in production is owed a refund on a say-so today (0 of 79), so
-- nothing already listed changes.

create or replace function public.registration_money_confirmed(o public.registration_orders)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select o.total_pence > 0
     and (o.payment_status = 'received'
          or (o.payment_status = 'reported' and o.payment_verified_at is not null))
$function$;
-- The database's own question, asked by the functions below; no screen calls it.
revoke all on function public.registration_money_confirmed(public.registration_orders) from public, anon, authenticated;
comment on function public.registration_money_confirmed(public.registration_orders) is
  'Whether the church has confirmed this order''s money arrived: marked paid, or a reported payment verified. What a refund is owed for (0336).';
comment on function public.registration_money_in(public.registration_orders) is
  'Its money is in, or said to be. Since 0336 only what stops an event being deleted; a refund is owed by registration_money_confirmed().';

CREATE OR REPLACE FUNCTION public.registration_order_cancel(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      -- 0336: owed only for money the church has confirmed arrived.
      refund_status = case when public.registration_money_confirmed(o) then 'owed' else refund_status end
  where id = o.id;
  -- A cancelled registration holds no use of its code (0300), whoever cancelled it.
end;
$function$;

CREATE OR REPLACE FUNCTION public.registration_event_cancel(p_event uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- 0336: owed only for money the church has confirmed arrived. A payment that is only
  -- said to have been made becomes owed when it is marked paid or verified, below.
  where o.event_id = ev.id and o.status = 'confirmed' and o.refund_status is null and public.registration_money_confirmed(o);
  get diagnostics owed = row_count;

  -- Out of the church diary.
  delete from public.church_events e
  where e.id in (select diary_event_id from public.registration_event_dates where event_id = ev.id and diary_event_id is not null);

  return jsonb_build_object('ok', true, 'owed', owed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.registration_order_mark(p_id uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.registration_orders%rowtype;
  line record;
  tt public.registration_ticket_types%rowtype;
  ev public.registration_events%rowtype;
  need text := case p_action
    when 'received' then 'take_payment'
    -- Letting a payment go, or putting one back to not paid: the office's, and the door's own
    -- when it holds "Sort out problems" (0312).
    when 'waived' then 'waive'
    when 'awaiting' then 'waive'
    when 'check_in' then 'check_in'
    when 'undo_check_in' then 'check_in'
    -- One registration, not the event: 'cancel' is still what cancelling an event asks for.
    when 'cancel' then 'cancel_order'
    when 'restore' then 'cancel_order'
    when 'refunded' then 'refund'
  end;
begin
  if need is null then raise exception 'Unknown action: %', p_action; end if;
  if not public.registration_can(auth.uid(), need) then
    raise exception '%', case need
      when 'take_payment' then 'Taking payments is not one of your rights here.'
      when 'waive' then 'Waiving a payment, or putting one back to not paid, is not one of your rights here.'
      when 'check_in' then 'Checking people in is not one of your rights here.'
      when 'cancel_order' then 'Cancelling a registration, or putting one back, is not one of your rights here.'
      else 'Refunds are not one of your rights here.'
    end using errcode = '42501';
  end if;
  -- Reception for some events only (0313): not a registration of an event that is not theirs.
  perform public.registration_order_guard(p_id);
  select * into o from public.registration_orders where id = p_id for update;
  if not found then raise exception 'No such registration.'; end if;
  select * into ev from public.registration_events where id = o.event_id;

  if p_action in ('received', 'waived') then
    if o.payment_status = 'not_needed' then raise exception 'There is nothing to pay on this registration.'; end if;
    -- 0336: a cancelled registration whose payment was reported can still be marked paid:
    -- that is the office saying the money did arrive, which is what owes it a refund.
    if o.status <> 'confirmed' and not (p_action = 'received' and o.payment_status = 'reported') then
      raise exception 'This registration is cancelled. Put it back before taking a payment on it.';
    end if;
    update public.registration_orders
    set payment_status = p_action, received_at = now(), received_by = auth.uid(),
        payment_method = coalesce(payment_method, 'reception'),
        -- Money confirmed on a registration that is not going ahead is money to give back.
        refund_status = case
          when p_action = 'received' and refund_status is null and total_pence > 0
               and (status = 'cancelled' or ev.cancelled_at is not null) then 'owed'
          else refund_status end
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
        -- 0336: owed only for money the church has confirmed arrived.
        refund_status = case when public.registration_money_confirmed(o) and refund_status is null then 'owed' else refund_status end
    where id = p_id and status = 'confirmed';
  elsif p_action = 'restore' then
    if o.status = 'confirmed' then return; end if;
    if ev.cancelled_at is not null then raise exception 'This event was cancelled.'; end if;
    if o.refund_status = 'refunded' then raise exception 'This registration was refunded; register them again instead.'; end if;
    -- The invitation it came by (0296) must still have a use for it: its
    -- uses are its live orders, and somebody may have taken this one's.
    -- Asked before the ticket types are locked (0300): the invitation, then
    -- the code, then the ticket types is the order registering locks them in.
    if o.invite_id is not null then
      perform 1 from public.registration_invites i where i.id = o.invite_id for update;
      if exists (select 1 from public.registration_invites i
                 where i.id = o.invite_id and i.max_uses is not null
                   and public.registration_invite_uses(i.id) >= i.max_uses) then
        raise exception 'The invite link this registration came by has been used again since, and has no uses left. Register them again instead.';
      end if;
    end if;
    -- …and so must the use of its promo code (0300): a cancelled registration
    -- holds none, so coming back takes one, if the code still has it to give.
    if o.promo_code_id is not null and not public.registration_promo_has_use(o.promo_code_id) then
      raise exception 'The promo code on this registration has been used again since, and has no uses left. Register them again instead.';
    end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.registration_order_verify(p_id uuid, p_verified boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.registration_orders%rowtype;
begin
  if not public.registration_can(auth.uid(), 'verify') then
    raise exception 'Verifying a payment is for the Pastor, the Owner, or whoever the church has given it to.' using errcode = '42501';
  end if;
  select * into o from public.registration_orders where id = p_id for update;
  if not found then
    raise exception 'That registration is not there any more.' using errcode = 'P0002';
  end if;
  if coalesce(p_verified, false) then
    if o.status <> 'confirmed' then
      raise exception 'This registration is cancelled.' using errcode = 'P0001';
    end if;
    if o.total_pence <= 0 or o.payment_status in ('not_needed', 'waived') then
      raise exception 'There is no payment on this registration to verify.' using errcode = 'P0001';
    end if;
    update public.registration_orders r
      set payment_verified_at = now(), payment_verified_by = auth.uid(),
          -- 0336: verified on an event that was cancelled is money to give back.
          refund_status = case
            when r.refund_status is null and r.payment_status in ('reported', 'received')
                 and exists (select 1 from public.registration_events e where e.id = r.event_id and e.cancelled_at is not null) then 'owed'
            else r.refund_status end
      where r.id = p_id;
  else
    update public.registration_orders
      set payment_verified_at = null, payment_verified_by = null
      where id = p_id;
  end if;
end;
$function$;

notify pgrst, 'reload schema';
select public.migration_done(336, '0336_a_refund_is_owed_for_money_that_arrived', 'c217e344d3b6a1e1744f2f3a6935c89f7a30acd46b820ac4cf3c9719c70d8e4e');
