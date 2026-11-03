-- 0254: two rules the audit found wanting (November 2026).
--
-- 1. The link cannot change once the event is published. From that moment
--    it is in emails, on posters and in QR codes; a slug edited in the
--    office would send every one of them to "No such event". The editor
--    locks the field, and the guard trigger refuses the change whoever
--    makes it.
--
-- 2. No money is taken on a cancelled registration. registration_order_mark
--    let 'received' and 'waived' through whatever the order's status, so a
--    cancelled order could be marked paid with no refund owed — nothing on
--    a page offers it, but the rule belongs in the database. Put it back
--    first, then take the payment.

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
    -- The link is on posters and in emails from the moment it is published.
    if old.status <> 'draft' and new.slug <> old.slug then
      raise exception 'The link is out, so it cannot change now.';
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
    if o.status <> 'confirmed' then raise exception 'This registration is cancelled. Put it back before taking a payment on it.'; end if;
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
