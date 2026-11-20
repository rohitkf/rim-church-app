/*
 * Reception sorts out its own problems, and an Admin runs registrations
 * out of the box (asked for by the Owner on 20 November 2026, the first
 * day of the Pastors' & Leaders Conference).
 *
 * 1. The door could do three things and nothing else.
 *    Check in, take a payment, register a walk-in (0251) — each with an
 *    Undo for ten minutes (0281). Anything that did not fit was the
 *    office's: somebody whose email was typed wrong and has no ticket;
 *    somebody who was meant to use a promo code and did not; somebody
 *    the Pastor says is to come in free; a payment marked on the wrong
 *    row and noticed after the Undo had gone; a registration cancelled
 *    that should not have been, or a duplicate that should be; a word
 *    for whoever looks at this registration next. At a door, on the
 *    day, the office is not there — the person holding the phone is.
 *
 *    So Reception has a fifth right, reg.door_fix ("Sort out problems"):
 *
 *      correct an email address, or send the ticket again   (0283)
 *      add or change the note on a registration
 *      put a promo code on a registration already made      (0298)
 *      waive a payment, or put one back to not paid
 *      cancel one registration, or put one back
 *
 *    It is a door right like the other four: given to a person or a
 *    team in Settings › Reception, opening Reception by itself, and
 *    switched off while Reception is locked (0288). It is its own tick,
 *    so the church can have somebody scan tickets who may not let a
 *    payment go.
 *
 *    What it does not give is the office's: verifying a payment against
 *    the bank (0267), "not received, ask again", marking a refund as
 *    sent, taking a promo code off, editing the event, cancelling the
 *    event. Those need somebody who can see the accounts or who answers
 *    for the event.
 *
 *    Everybody who works the door today is given it: whoever holds
 *    reg.door, reg.door_pay or reg.walk_in, person or team. Somebody
 *    here to look only (reg.door_view alone) is not.
 *
 * 2. An Admin had one registrations right, "Correct email addresses"
 *    (0283), and Reception only if a cell was ticked. The Owner: "By
 *    default admins and owners have all the access to everything." So an
 *    Admin's cell is Yes out of the box on every registrations and
 *    Reception row — verifying a payment included, which 0267 kept for
 *    the Pastor. They are still cells: the church can turn any of them
 *    off again in Access & Privileges. No church has set one of these
 *    cells itself (role_permissions held no reg.* row when this was
 *    written), so nobody's choice is overruled.
 *
 * How it is said to the database: registration_can() learns four words —
 * 'fix' (the right itself), 'waive', 'cancel_order' and 'promo' (the
 * office's right or the door's) and 'note' (anybody in the office, or
 * the door's right) — and 'email', 'door' and 'work' now count the new
 * right. registration_order_mark() asks for 'waive' and 'cancel_order'
 * where it asked for 'approve' and 'cancel'; nothing else in it moves,
 * and what the other four door rights may do is exactly what it was.
 * 'approve' and 'cancel' themselves are untouched: cancelling an event,
 * "we could not match your payment" and taking a code off still ask for
 * those, and the door's right does not answer to them.
 */

-- ---------------------------------------------------------------------------
-- The right, and an Admin's cells
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('reg.door_fix', 'admin', '{none,all}', 'all'),
  ('reg.door_fix', 'head', '{none,all}', 'none'),
  ('reg.door_fix', 'assistant', '{none,all}', 'none'),
  ('reg.door_fix', 'coordinator', '{none,all}', 'none'),
  ('reg.door_fix', 'member', '{none,all}', 'none'),
  ('reg.door_fix', 'newcomer', '{none,all}', 'none'),
  ('reg.door_fix', 'overwatch', '{none,all}', 'none'),
  ('reg.door_fix', 'pastor', '{none,all}', 'none'),
  ('reg.manage', 'admin', '{none,all}', 'all'),
  ('reg.view', 'admin', '{none,all}', 'all'),
  ('reg.edit', 'admin', '{none,all}', 'all'),
  ('reg.approve', 'admin', '{none,all}', 'all'),
  ('reg.verify', 'admin', '{none,all}', 'all'),
  ('reg.email', 'admin', '{none,all}', 'all'),
  ('reg.refund', 'admin', '{none,all}', 'all'),
  ('reg.cancel', 'admin', '{none,all}', 'all'),
  ('reg.door', 'admin', '{none,all}', 'all'),
  ('reg.door_pay', 'admin', '{none,all}', 'all'),
  ('reg.walk_in', 'admin', '{none,all}', 'all'),
  ('reg.door_view', 'admin', '{none,all}', 'all')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------

create or replace function public.registration_can(uid uuid, what text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case what
    when 'office' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                    or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
                    or public.may(uid, 'reg.verify') or public.may(uid, 'reg.email')
    when 'door' then public.may(uid, 'reg.manage')
                  or (not public.reception_is_locked()
                      and (public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                           or public.may(uid, 'reg.walk_in') or public.may(uid, 'reg.door_view')
                           or public.may(uid, 'reg.door_fix')))
    when 'work' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                  or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
                  or public.may(uid, 'reg.verify') or public.may(uid, 'reg.email')
                  or (not public.reception_is_locked()
                      and (public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                           or public.may(uid, 'reg.walk_in') or public.may(uid, 'reg.door_view')
                           or public.may(uid, 'reg.door_fix')))
    when 'edit' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.edit')
    when 'approve' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
    when 'take_payment' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
                          or (not public.reception_is_locked() and public.may(uid, 'reg.door_pay'))
    when 'refund' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.refund')
    when 'cancel' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.cancel')
    when 'delete' then exists (select 1 from public.app_owner where user_id = uid) or public.may(uid, 'reg.cancel')
    when 'check_in' then public.may(uid, 'reg.manage')
                      or (not public.reception_is_locked()
                          and (public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                               or public.may(uid, 'reg.walk_in')))
    when 'walk_in' then public.may(uid, 'reg.manage')
                     or (not public.reception_is_locked() and public.may(uid, 'reg.walk_in'))
    when 'verify' then public.may(uid, 'reg.verify')
    -- Correcting an address, and sending a ticket again: the office's right (0283) or the door's (0312).
    when 'email' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.email')
                   or (not public.reception_is_locked() and public.may(uid, 'reg.door_fix'))
    -- "Sort out problems" (0312): the door's own, off while Reception is locked.
    when 'fix' then public.may(uid, 'reg.manage')
                 or (not public.reception_is_locked() and public.may(uid, 'reg.door_fix'))
    when 'waive' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
                   or (not public.reception_is_locked() and public.may(uid, 'reg.door_fix'))
    when 'promo' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
                   or (not public.reception_is_locked() and public.may(uid, 'reg.door_fix'))
    when 'cancel_order' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.cancel')
                          or (not public.reception_is_locked() and public.may(uid, 'reg.door_fix'))
    when 'note' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                  or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
                  or public.may(uid, 'reg.verify') or public.may(uid, 'reg.email')
                  or (not public.reception_is_locked() and public.may(uid, 'reg.door_fix'))
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- The four things that ask
-- ---------------------------------------------------------------------------

-- As it stood, but for which right two of its actions ask for.
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
$$;

create or replace function public.registration_order_note(p_id uuid, p_notes text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.registration_can(auth.uid(), 'note') then
    raise exception 'Notes are for whoever runs registrations, or sorts out problems at Reception.' using errcode = '42501';
  end if;
  update public.registration_orders set notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), '') where id = p_id;
end;
$$;

create or replace function public.registration_order_apply_promo(p_id uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.registration_can(auth.uid(), 'promo') then
    raise exception 'Putting a promo code on a registration is not one of your rights here.' using errcode = '42501';
  end if;
  return public.registration_apply_promo(p_id, p_code);
end;
$$;

-- The codes themselves: read by the office, and by whoever is to put one on at the door —
-- the dialog lists the event's codes with what each would bring the registration to.
drop policy if exists registration_promo_codes_select on public.registration_promo_codes;
create policy registration_promo_codes_select on public.registration_promo_codes
  for select using ((select public.registration_can((select auth.uid()), 'office'))
      or (select public.registration_can((select auth.uid()), 'fix')));

-- ---------------------------------------------------------------------------
-- Everybody who works the door is given it
-- ---------------------------------------------------------------------------

insert into public.permission_grants (capability, user_id, department_id, reach, leads_only, expires_at, granted_by)
select distinct on (g.user_id, g.department_id)
       'reg.door_fix', g.user_id, g.department_id, 'all', g.leads_only, g.expires_at, g.granted_by
from public.permission_grants g
where g.capability in ('reg.door', 'reg.door_pay', 'reg.walk_in')
  and not exists (
    select 1 from public.permission_grants f
    where f.capability = 'reg.door_fix'
      and f.user_id is not distinct from g.user_id
      and f.department_id is not distinct from g.department_id
  )
order by g.user_id, g.department_id, (g.capability = 'reg.door') desc, g.granted_at;
select public.migration_done(312, '0312_reception_sorts_out_its_own_problems', 'f936678861ba1a0558fa4a0e3f6b7d44b1fed42f956728c83f478c0fb0480e9c');
