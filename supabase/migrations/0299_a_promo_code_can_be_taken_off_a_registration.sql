/*
 * 0299 — a promo code can be taken off a registration
 *
 * 0298 let the church put a code on somebody's registration for them, and
 * Undo takes that back — for ten minutes, for whoever pressed. After that
 * there was nothing: a code put on the wrong person's registration, or one
 * used by somebody it was never meant for, stayed on it, and the only way
 * out was to cancel the registration and make it again.
 *
 * registration_order_remove_promo(order) is the other half. It is the
 * same right as putting one on — "Approve payments"
 * (`registration_can(uid, 'approve')`) — and only the church's: an
 * attendee has no reason to give a discount back, and the ticket page
 * offers no such thing.
 *
 * It takes a registration that is live, on an event that is not
 * cancelled, with a promo code on it, and nothing done since that the
 * new price would contradict:
 *
 *   not checked in        a registration that owes is not let in (0266);
 *                         taking the code off one already through the door
 *                         would make exactly that. Undo the check-in first.
 *   no payment recorded   reported, received or waived was said about the
 *                         discounted price. Back to awaiting payment first:
 *                         a decision, not a side effect — as 0298 says of
 *                         putting a code on.
 *
 * Then the registration is as if the code had never been used: no
 * discount, the total back to the tickets' own prices, awaiting payment
 * (or nothing to pay, where the tickets were free anyway), and the code
 * has its use back. An invitation's discount (0295) is not a promo code
 * and is not touched: it came with the link, and is refused by name.
 *
 * Asked a second time, with no code left on the registration, it answers
 * yes and changes nothing — for the same reason 0298 does: an answer can
 * be lost on the way back.
 *
 * Undo. Nothing new is remembered: 0298 already put the price and the
 * code into what Undo restores, and names the press "promo code". What
 * Undo did not do is the other direction of the count — taking a code off
 * gives its use back, so putting it back on must use the code again.
 * registration_order_undo() now does, and refuses in words where it
 * cannot: the code has been deleted since, or somebody has taken its last
 * use in the meantime. (Before this, undoing over a deleted code failed on
 * the foreign key with the database's own sentence.) A code only turned
 * off since is put back all the same: Undo restores what was, and the
 * code was good when it was used. A limit is different — it is a count,
 * and putting one more on it would break it.
 *
 * A code that took nothing off. Registering with a code spends a use even
 * where it comes to nothing (free tickets only). Taking that code off
 * changes no price and no payment; it only gives the use back.
 *
 * Compatible with the app in production: one new function, and an Undo
 * that answers as before for everything the app there can ask of it.
 */

-- ---------------------------------------------------------------------------
-- 1. Taking a code off a registration. The church's only: whoever may approve
--    payments. Returns {"ok": true, "discount_pence", "total_pence"}; every
--    refusal is an exception with a sentence the page can show.
-- ---------------------------------------------------------------------------
create or replace function public.registration_order_remove_promo(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  ev public.registration_events%rowtype;
begin
  if not public.registration_can(auth.uid(), 'approve') then
    raise exception 'Approving payments is not one of your rights here.' using errcode = '42501';
  end if;
  select * into o from public.registration_orders where id = p_id for update;
  if not found then raise exception 'No such registration.'; end if;
  select * into ev from public.registration_events where id = o.event_id;
  if o.status <> 'confirmed' then raise exception 'This registration was cancelled.'; end if;
  if ev.cancelled_at is not null then raise exception 'This event was cancelled.'; end if;
  if o.promo_code is null and o.promo_code_id is null then
    -- An invitation's discount came with the link (0295): not a code to take off.
    if o.invite_id is not null and o.discount_pence > 0 then
      raise exception 'The discount on this registration came with an invite link, not a promo code.';
    end if;
    -- Asked again after the first answer was lost on the way back: yes, and
    -- nothing changes.
    return jsonb_build_object('ok', true, 'discount_pence', o.discount_pence, 'total_pence', o.total_pence);
  end if;
  if o.checked_in_at is not null then
    raise exception 'This registration has been checked in. Undo the check-in first.';
  end if;
  if o.payment_status not in ('not_needed', 'awaiting') then
    raise exception 'A payment has already been recorded on this registration.';
  end if;

  update public.registration_orders
  set discount_pence = 0,
      total_pence = subtotal_pence,
      promo_code = null,
      promo_code_id = null,
      payment_status = case when subtotal_pence > 0 then 'awaiting' else 'not_needed' end
  where id = o.id;
  -- The code has its use back. One deleted since (the order kept its word,
  -- not its row) has nothing to give it to.
  if o.promo_code_id is not null then
    update public.registration_promo_codes set uses = greatest(uses - 1, 0) where id = o.promo_code_id;
  end if;

  return jsonb_build_object('ok', true, 'discount_pence', 0, 'total_pence', o.subtotal_pence);
end;
$$;
revoke all on function public.registration_order_remove_promo(uuid) from public, anon;
grant execute on function public.registration_order_remove_promo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Undo: registration_order_undo() as it stood (0298), using the code again
--    when what is taken back is a code taken off.
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
  code_back uuid;
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
  -- A memory from before 0298 has no price in it: it is held to what it did
  -- remember, not refused for what it never knew.
  if (case when u.became ? 'total_pence' then public.registration_order_state(o)
           else public.registration_order_state(o) - 'discount_pence' - 'total_pence' - 'promo_code' - 'promo_code_id' end)
     is distinct from u.became then
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

    -- A promo code the press took off (0299): putting it back uses the code
    -- again, so the code must still be there and still have the use.
    if (u.was ->> 'promo_code_id') is not null and o.promo_code_id is null then
      code_back := (u.was ->> 'promo_code_id')::uuid;
      perform 1 from public.registration_promo_codes p where p.id = code_back for update;
      if not found then
        perform set_config('rim.registration_undoing', '', true);
        raise exception 'That promo code has been deleted since. Use the menu to put a code on this registration.';
      end if;
      if exists (select 1 from public.registration_promo_codes p
                 where p.id = code_back and p.max_uses is not null and p.uses >= p.max_uses) then
        perform set_config('rim.registration_undoing', '', true);
        raise exception 'That promo code has been used again since, and has no uses left.';
      end if;
      update public.registration_promo_codes set uses = uses + 1 where id = code_back;
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
select public.migration_done(299, '0299_a_promo_code_can_be_taken_off_a_registration', '22068d3b18172357a7b2150eb2832d686187ea8fb6f44c8e7c60c1766261b440');
