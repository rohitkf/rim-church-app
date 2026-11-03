-- Deleting a registration event failed (found by the Owner on the first
-- real event): "update or delete on table registration_ticket_types
-- violates foreign key constraint registration_order_tickets_ticket_type_id_fkey".
--
-- Why: deleting the event cascades to its ticket types and to its orders,
-- as two separate inner statements, in the order the constraints were
-- made — ticket types first. An order's tickets point at their ticket
-- type with a plain (NO ACTION) foreign key, and NO ACTION is checked at
-- the end of the statement that deleted the referenced rows: the inner
-- one, while the orders and their tickets were still there. The same
-- holds for an order's chosen date. Cancelling the registrations first
-- changes nothing, because a cancelled order keeps its tickets.
--
-- The fix is to let those two checks wait for the end of the transaction,
-- by which time the orders' cascade has run too. Nothing else changes:
-- removing a ticket type or a date that has orders (even cancelled ones)
-- is still refused, at commit instead of at once, and the editor still
-- says so. The app also deletes an event's orders before the event, which
-- works on either shape of the constraint.

alter table public.registration_order_tickets
  drop constraint if exists registration_order_tickets_ticket_type_id_fkey;
alter table public.registration_order_tickets
  add constraint registration_order_tickets_ticket_type_id_fkey
  foreign key (ticket_type_id) references public.registration_ticket_types (id)
  deferrable initially deferred;

alter table public.registration_orders
  drop constraint if exists registration_orders_date_id_fkey;
alter table public.registration_orders
  add constraint registration_orders_date_id_fkey
  foreign key (date_id) references public.registration_event_dates (id)
  deferrable initially deferred;
