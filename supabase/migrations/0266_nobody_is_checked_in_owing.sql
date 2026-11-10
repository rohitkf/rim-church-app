/*
 * Nobody is checked in while their registration is still to pay (asked for
 * by the Owner, November 2026).
 *
 * People were registering and not paying, and the door could still let
 * them in: registration_order_mark's check_in asked only that the order
 * was live, and a walk-in could be registered "here" while owing. The
 * scanner held an unpaid code up, but offered a plain Check in beside
 * "Paid now, check in".
 *
 * Now a registration with money on it is checked in only once that money
 * is in — received, or waived by whoever may approve. One rule on the row
 * itself, so it holds for the scanner, Find, the event's own page, a
 * walk-in and any direct write alike. "Paid now, check in" still does both
 * in order; a receipt that is being checked wants marking as received
 * first, as it always needed before it became a ticket.
 *
 * Only the moment of checking in is held. Somebody already in stays in if
 * a payment is later put back to awaiting, and undoing a check-in is never
 * refused.
 */
create or replace function public.registration_no_check_in_owing()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.checked_in_at is not null
     and (tg_op = 'INSERT' or new.checked_in_at is distinct from old.checked_in_at)
     and new.total_pence > 0
     and new.payment_status in ('awaiting', 'reported') then
    raise exception 'This registration is not paid yet. Take the payment, or mark it received, before checking them in.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.registration_no_check_in_owing() from public, anon, authenticated;

drop trigger if exists registration_orders_no_check_in_owing on public.registration_orders;
create trigger registration_orders_no_check_in_owing
  before insert or update of checked_in_at on public.registration_orders
  for each row execute function public.registration_no_check_in_owing();

notify pgrst, 'reload schema';
