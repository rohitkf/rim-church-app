-- 0252: registration_refund_needs_details() answers false, never null.
--
-- It was `o.refund_status = 'owed' and …`, and an order with no refund has
-- refund_status null, so the answer was null. Two things followed:
--
--   * registration_order_view() sent refund_details_wanted: null, which the
--     ticket page refused, so every ticket link (and the page a new
--     registration lands on) said "No such ticket".
--   * registration_refund_request() tests `if not …needs_details(o)`, and
--     `not null` is null, so the guard never raised: bank details could be
--     sent for an order that is owed nothing.
--
-- `is not distinct from` treats null as "not owed". Nothing else changes.

create or replace function public.registration_refund_needs_details(o public.registration_orders)
returns boolean
language sql
immutable
set search_path = public
as $$
  select o.refund_status is not distinct from 'owed'
     and coalesce(o.payment_method, 'reception') = 'reception'
$$;
