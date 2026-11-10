/*
 * The Pastor verifies a payment (asked for by the Owner, November 2026).
 *
 * Only the Pastor can see the bank account and PayPal, so only the Pastor
 * (and the Owner) can say that a payment really arrived. The office could
 * mark an order "received", but that was the office's word. Now there is a
 * second, separate fact on an order — "Verified payment" — set by whoever
 * holds a right of its own, and everybody else carries on from it: the
 * office marks it received, Reception checks them in.
 *
 * Two new rights, each a row in the grid:
 *
 *   reg.verify      Verify payments. Says a payment arrived; shows the
 *                   "Verified payment" tag. NOT part of "Run
 *                   registrations": it is the Pastor's (and the Owner's,
 *                   as everything is) unless the church gives it to
 *                   somebody else. Opens the Registrations page.
 *   reg.door_view   See Reception, read only: the list and the counts,
 *                   nothing to press.
 *
 * The Pastor's column gets a cell on every registrations row. Out of the
 * box a Pastor may view registrations (reg.view), see Reception
 * (reg.door_view) and verify payments (reg.verify) — a read-only view of
 * both pages and the one button. Every other cell of theirs is No, and
 * every one is the church's to change. may() already reads a Pastor's
 * cell wherever the catalog has one (0214), so nothing else moves.
 *
 * Verifying does not mark the order received and issues no ticket: that
 * stays the office's step. A payment the office sends back to "awaiting"
 * ("Not received, ask again") loses its verification — whatever was
 * verified, it was not this.
 */

alter table public.registration_orders
  add column if not exists payment_verified_at timestamptz,
  add column if not exists payment_verified_by uuid references public.profiles (id) on delete set null;

comment on column public.registration_orders.payment_verified_at is
  'When somebody with reg.verify (the Pastor, the Owner) said this payment arrived in the bank or PayPal. Separate from payment_status.';

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('reg.verify', 'admin', '{none,all}', 'none'),
  ('reg.verify', 'head', '{none,all}', 'none'),
  ('reg.verify', 'assistant', '{none,all}', 'none'),
  ('reg.verify', 'coordinator', '{none,all}', 'none'),
  ('reg.verify', 'member', '{none,all}', 'none'),
  ('reg.verify', 'newcomer', '{none}', 'none'),
  ('reg.verify', 'pastor', '{none,all}', 'all'),
  ('reg.door_view', 'admin', '{none,all}', 'none'),
  ('reg.door_view', 'head', '{none,all}', 'none'),
  ('reg.door_view', 'assistant', '{none,all}', 'none'),
  ('reg.door_view', 'coordinator', '{none,all}', 'none'),
  ('reg.door_view', 'member', '{none,all}', 'none'),
  ('reg.door_view', 'newcomer', '{none}', 'none'),
  ('reg.door_view', 'pastor', '{none,all}', 'all'),
  -- The Pastor's cell on the rows there already were.
  ('reg.view', 'pastor', '{none,all}', 'all'),
  ('reg.manage', 'pastor', '{none,all}', 'none'),
  ('reg.edit', 'pastor', '{none,all}', 'none'),
  ('reg.approve', 'pastor', '{none,all}', 'none'),
  ('reg.refund', 'pastor', '{none,all}', 'none'),
  ('reg.cancel', 'pastor', '{none,all}', 'none'),
  ('reg.door', 'pastor', '{none,all}', 'none'),
  ('reg.door_pay', 'pastor', '{none,all}', 'none'),
  ('reg.walk_in', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- Every check still goes through here. 'office' and 'door' open the two
-- pages; 'work' reads the rows; 'verify' is the new one, and nothing else
-- gives it — not reg.manage.
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
                    or public.may(uid, 'reg.verify')
    -- Opening Reception.
    when 'door' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                  or public.may(uid, 'reg.walk_in') or public.may(uid, 'reg.door_view')
    -- Reading the rows at all: either of those.
    when 'work' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                  or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
                  or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay') or public.may(uid, 'reg.walk_in')
                  or public.may(uid, 'reg.verify') or public.may(uid, 'reg.door_view')
    when 'edit' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.edit')
    when 'approve' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
    when 'take_payment' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve') or public.may(uid, 'reg.door_pay')
    when 'refund' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.refund')
    when 'cancel' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.cancel')
    when 'delete' then exists (select 1 from public.app_owner where user_id = uid) or public.may(uid, 'reg.cancel')
    when 'check_in' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                      or public.may(uid, 'reg.walk_in')
    when 'walk_in' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.walk_in')
    when 'verify' then public.may(uid, 'reg.verify')
    else false
  end
$$;
revoke all on function public.registration_can(uuid, text) from public, anon;
grant execute on function public.registration_can(uuid, text) to authenticated;

-- Verify a payment, or take the verification back.
create or replace function public.registration_order_verify(p_id uuid, p_verified boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
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
    update public.registration_orders
      set payment_verified_at = now(), payment_verified_by = auth.uid()
      where id = p_id;
  else
    update public.registration_orders
      set payment_verified_at = null, payment_verified_by = null
      where id = p_id;
  end if;
end;
$$;
revoke all on function public.registration_order_verify(uuid, boolean) from public, anon;
grant execute on function public.registration_order_verify(uuid, boolean) to authenticated;

-- Sent back to "awaiting", or waived: whatever was verified, it is not
-- what this order now says.
create or replace function public.registration_unverify_when_not_paid()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payment_verified_at is not null
     and new.payment_status is distinct from old.payment_status
     and new.payment_status in ('awaiting', 'waived', 'not_needed')
     and old.payment_status in ('reported', 'received') then
    new.payment_verified_at := null;
    new.payment_verified_by := null;
  end if;
  return new;
end;
$$;
revoke all on function public.registration_unverify_when_not_paid() from public, anon, authenticated;

drop trigger if exists registration_orders_unverify on public.registration_orders;
create trigger registration_orders_unverify
  before update of payment_status on public.registration_orders
  for each row execute function public.registration_unverify_when_not_paid();

notify pgrst, 'reload schema';
