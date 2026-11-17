/*
 * 0300 — a promo code's uses are its live registrations
 *
 * `registration_promo_codes.uses` was a number kept by hand: every
 * function that put a code on a registration added one, and some of the
 * ones that took a registration away took one off. Not all of them:
 *
 *   the attendee cancels    one off        (0250)
 *   the church cancels      nothing
 *   the church puts it back nothing        — so cancelled by the attendee
 *                                            and put back by the church, a
 *                                            registration carried the code
 *                                            with its use already given away
 *   a walk-in undone        nothing
 *
 * and each new way of moving a code (0298 put one on afterwards, 0299
 * took one off, and Undo of each) had to remember both directions. A
 * count kept in six places drifts; with a limit on the code, a count
 * that is too low lets one more person in than the church said.
 *
 * An invitation's uses were never kept: they are counted from its live
 * orders (`registration_invite_uses()`, 0295), and cannot be wrong. This
 * gives a promo code the same footing, without taking the column away —
 * the pages read it, and so does every limit check:
 *
 *   registration_promo_uses(code)   the count: confirmed registrations
 *                                   that carry the code. A cancelled one
 *                                   holds no use, whoever cancelled it.
 *   on registration_promo_codes     before any insert or update, `uses` is
 *                                   set to that count. Nothing can write a
 *                                   different number — not a function, not
 *                                   the editor saving a code.
 *   on registration_orders          after any statement that makes, removes
 *                                   or changes registrations, the codes of
 *                                   those that appeared, went, were cancelled
 *                                   or put back, or changed code are counted
 *                                   again — once a code, however many
 *                                   registrations the statement moved.
 *
 * So the functions no longer keep the number, and the lines that did are
 * taken out of registering, putting a code on, taking one off, the
 * attendee's cancel and Undo. Their limit checks are as they were: they
 * lock the code's row and read `uses`, which is now always true.
 *
 * Putting a registration back uses its code again. That is new — before,
 * the church's cancel never gave the use away, so there was nothing to
 * take back. Now it must still be there: "Put back" and Undo of a
 * cancellation refuse, in the words they already use for an invite link,
 * when the code's last use has gone to somebody else since. One function
 * asks it for all of them, registration_promo_has_use(), under a lock on
 * the code's row.
 *
 * The order of locks. Registering locks the invitation, then the code,
 * then the event's ticket types. Put back and Undo locked the ticket
 * types first and the invitation after, and would now have locked the
 * code after too — the other way round from somebody registering at the
 * same moment with the same code, which is a deadlock. Both now ask about
 * the invitation and the code first, in registering's order, and the
 * ticket types last.
 *
 * The limit, held where the count is. The functions check a code's limit
 * before they move a registration. But registrations can also be written
 * directly by whoever runs them (the table's own update policy), and a
 * function written later could forget. So the same trigger that counts
 * refuses a statement that leaves a code over its limit by a registration
 * that has just taken a use: the limit holds whatever wrote the row.
 *
 * The numbers as they stand are counted once at the end. On the day this
 * was written every code's count already matched its live registrations.
 *
 * Compatible with the app in production: it reads `uses` as before, and
 * what it reads is right.
 */

-- ---------------------------------------------------------------------------
-- 1. The count, the triggers that keep the column to it, and the one question
--    "has this code a use left?".
-- ---------------------------------------------------------------------------
-- Volatile on purpose: asked from inside a trigger, it must see what the
-- statement that fired the trigger has just done.
create or replace function public.registration_promo_uses(p_id uuid)
returns int
language sql
volatile
security definer
set search_path = public
as $$
  select count(*)::int from public.registration_orders o
  where o.promo_code_id = p_id and o.status = 'confirmed';
$$;
revoke all on function public.registration_promo_uses(uuid) from public, anon, authenticated;

create or replace function public.registration_promo_codes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.uses := public.registration_promo_uses(new.id);
  return new;
end;
$$;
revoke all on function public.registration_promo_codes_count() from public, anon, authenticated;

drop trigger if exists registration_promo_codes_count on public.registration_promo_codes;
create trigger registration_promo_codes_count
  before insert or update on public.registration_promo_codes
  for each row execute function public.registration_promo_codes_count();

-- Whether a code still has a use to give, under a lock on its row, for a
-- registration about to take one. A code that is gone holds nobody back:
-- the registration kept its word, not its row.
create or replace function public.registration_promo_has_use(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c public.registration_promo_codes%rowtype;
begin
  select * into c from public.registration_promo_codes p where p.id = p_id for update;
  if not found then return true; end if;
  return c.max_uses is null or c.uses < c.max_uses;
end;
$$;
revoke all on function public.registration_promo_has_use(uuid) from public, anon, authenticated;

-- After a statement on registrations: the codes of those that appeared, went,
-- were cancelled or put back, or changed code are written again, which counts
-- them — once a code, in one order, however many rows the statement moved.
-- One that moved nothing of the kind touches no code, so the codes' own
-- "something changed" is not told for a change that was not theirs.
-- And the limit is held here too: a registration that has just taken a use
-- must not leave its code over the limit, whatever wrote the row.
create or replace function public.registration_orders_count_promo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  codes uuid[];
  over boolean := false;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct n.promo_code_id order by n.promo_code_id) into codes
    from moved_new n where n.promo_code_id is not null;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct o.promo_code_id order by o.promo_code_id) into codes
    from moved_old o where o.promo_code_id is not null;
  else
    select array_agg(distinct v.code order by v.code) into codes
    from moved_old o
    join moved_new n on n.id = o.id
    cross join lateral (values (o.promo_code_id), (n.promo_code_id)) v(code)
    where v.code is not null
      and (n.status is distinct from o.status or n.promo_code_id is distinct from o.promo_code_id);
  end if;
  if codes is null then
    return null;
  end if;

  perform 1 from public.registration_promo_codes p where p.id = any (codes) order by p.id for update;
  update public.registration_promo_codes p set uses = p.uses where p.id = any (codes);

  if tg_op = 'INSERT' then
    select exists (
      select 1 from moved_new n
      join public.registration_promo_codes p on p.id = n.promo_code_id
      where n.status = 'confirmed' and p.max_uses is not null and p.uses > p.max_uses
    ) into over;
  elsif tg_op = 'UPDATE' then
    select exists (
      select 1 from moved_old o
      join moved_new n on n.id = o.id
      join public.registration_promo_codes p on p.id = n.promo_code_id
      where n.status = 'confirmed'
        and (o.status is distinct from 'confirmed' or o.promo_code_id is distinct from n.promo_code_id)
        and p.max_uses is not null and p.uses > p.max_uses
    ) into over;
  end if;
  if over then
    raise exception 'That promo code has no uses left.';
  end if;
  return null;
end;
$$;
revoke all on function public.registration_orders_count_promo() from public, anon, authenticated;

-- A statement trigger with the rows it moved is one trigger an event.
drop trigger if exists registration_orders_count_promo_made on public.registration_orders;
create trigger registration_orders_count_promo_made
  after insert on public.registration_orders
  referencing new table as moved_new
  for each statement execute function public.registration_orders_count_promo();

drop trigger if exists registration_orders_count_promo_changed on public.registration_orders;
create trigger registration_orders_count_promo_changed
  after update on public.registration_orders
  referencing old table as moved_old new table as moved_new
  for each statement execute function public.registration_orders_count_promo();

drop trigger if exists registration_orders_count_promo_gone on public.registration_orders;
create trigger registration_orders_count_promo_gone
  after delete on public.registration_orders
  referencing old table as moved_old
  for each statement execute function public.registration_orders_count_promo();

-- ---------------------------------------------------------------------------
-- 2. Registering: registration_register() as it stood (0298), no longer adding
--    to the code's count.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registration_register(p_slug text, p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ev public.registration_events%rowtype;
  closes timestamptz;
  v_name text := btrim(coalesce(p_order ->> 'name', ''));
  v_email text := lower(btrim(coalesce(p_order ->> 'email', '')));
  v_phone text := nullif(btrim(coalesce(p_order ->> 'phone', '')), '');
  v_date uuid := nullif(p_order ->> 'date_id', '')::uuid;
  v_promo text := upper(btrim(coalesce(p_order ->> 'promo_code', '')));
  promo public.registration_promo_codes%rowtype;
  -- An invitation link's token (0295), and the invitation it names.
  v_invite text := upper(btrim(coalesce(p_order ->> 'invite', '')));
  inv public.registration_invites%rowtype;
  -- The price of every ticket the invitation could take money off, one a ticket.
  eligible int[] := '{}';
  -- The same for a code that says how many tickets it covers (0296).
  promo_prices int[] := '{}';
  line jsonb;
  tt public.registration_ticket_types%rowtype;
  qty int;
  unit int;
  names jsonb;
  i int;
  total_qty int := 0;
  subtotal int := 0;
  discount int := 0;
  order_id uuid := gen_random_uuid();
  v_code text;
  seen uuid[] := '{}';
begin
  -- A field no person sees, filled in: a bot. Say yes and do nothing.
  if coalesce(p_order ->> 'website', '') <> '' then
    return jsonb_build_object('ok', true, 'code', null);
  end if;

  select * into ev from public.registration_events where slug = lower(btrim(p_slug)) for update;
  if not found or ev.status <> 'published' then
    raise exception 'Registration is not open for this event.';
  end if;
  closes := public.registration_closes(ev);
  if ev.registration_opens_at is not null and ev.registration_opens_at > now() then
    raise exception 'Registration has not opened yet.';
  end if;
  if closes is not null and closes <= now() then
    raise exception 'Registration has closed.';
  end if;

  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'Please give your name.'; end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'That email address does not look right.';
  end if;
  if v_phone is not null and length(v_phone) > 40 then raise exception 'That phone number is too long.'; end if;

  if ev.date_mode = 'choose' then
    if v_date is null or not exists (
      select 1 from public.registration_event_dates d where d.id = v_date and d.event_id = ev.id and d.starts_at > now()
    ) then
      raise exception 'Please choose a date that has not started yet.';
    end if;
  else
    v_date := null;
  end if;

  -- Too many orders under one address: a loop, or somebody's script.
  if (select count(*) from public.registration_orders o
      where o.event_id = ev.id and lower(o.email) = v_email and o.status = 'confirmed') >= 5 then
    raise exception 'There are already several registrations under this email address. Please contact the church.';
  end if;

  -- An invitation (0295). Everything the page was told when it opened is
  -- asked again here, under a lock on the invitation's row: two people
  -- holding the same link cannot both take its last use.
  if v_invite <> '' then
    select * into inv from public.registration_invites i
    where i.event_id = ev.id and i.token = v_invite
    for update;
    if not found or not inv.active or inv.anonymised_at is not null
       or (inv.expires_at is not null and inv.expires_at <= now()) then
      raise exception 'This invitation is no longer valid. You can still register without it.';
    end if;
    if inv.max_uses is not null and public.registration_invite_uses(inv.id) >= inv.max_uses then
      raise exception 'This invitation has already been used. You can still register without it.';
    end if;
    if inv.locked_email is not null and inv.locked_email <> v_email then
      raise exception 'This invitation was sent to a different email address. Use that address, or register without the invitation.';
    end if;
    -- An invitation and a code are never both taken: the invitation wins.
    v_promo := '';
  end if;

  if v_promo <> '' then
    select * into promo from public.registration_promo_codes p
    where p.event_id = ev.id and p.code = v_promo and p.active
      and (p.max_uses is null or p.uses < p.max_uses)
    for update;
    if not found then raise exception 'That promo code is not valid.'; end if;
  end if;

  if jsonb_typeof(p_order -> 'lines') <> 'array' or jsonb_array_length(p_order -> 'lines') = 0 then
    raise exception 'Choose at least one ticket.';
  end if;

  -- Hold the event's ticket types, so two people cannot take the last one.
  perform 1 from public.registration_ticket_types where event_id = ev.id for update;

  insert into public.registration_orders
    (id, code, event_id, date_id, name, email, phone, quantity, payment_status)
  values
    (order_id, public.registration_new_code(), ev.id, v_date, v_name, v_email, v_phone, 1, 'not_needed')
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

    unit := case tt.kind
      when 'free' then 0
      when 'paid' then tt.price_pence
      else coalesce((line ->> 'donation_pence')::int, 0)
    end;
    if tt.kind = 'donation' and (unit < 0 or unit > 1000000 or unit < coalesce(tt.min_donation_pence, 0)) then
      raise exception 'The least for "%" is £%.', tt.name, to_char(coalesce(tt.min_donation_pence, 0) / 100.0, 'FM999990.00');
    end if;

    names := case when jsonb_typeof(line -> 'attendee_names') = 'array' then line -> 'attendee_names' else '[]'::jsonb end;
    for i in 1..qty loop
      insert into public.registration_order_tickets (order_id, ticket_type_id, attendee_name, unit_price_pence)
      values (order_id, tt.id, nullif(left(btrim(coalesce(names ->> (i - 1), '')), 120), ''), unit);
    end loop;
    -- The last of a type gone: tell whoever runs registrations (0245). Inside
    -- the same transaction, so a later line failing takes the notice with it.
    perform public.registration_sold_out_notify(ev.id, tt.id, v_date);

    total_qty := total_qty + qty;
    subtotal := subtotal + unit * qty;
    if tt.kind = 'paid' and promo.id is not null
       and (cardinality(promo.ticket_type_ids) = 0 or tt.id = any (promo.ticket_type_ids)) then
      promo_prices := promo_prices || array_fill(unit, array[qty]);
    end if;
    if tt.kind = 'paid' and inv.id is not null and inv.discount_kind is not null
       and (cardinality(inv.ticket_type_ids) = 0 or tt.id = any (inv.ticket_type_ids)) then
      eligible := eligible || array_fill(unit, array[qty]);
    end if;
  end loop;

  if total_qty < ev.min_per_order then
    raise exception 'At least % % per order.', ev.min_per_order, case when ev.min_per_order = 1 then 'ticket' else 'tickets' end;
  end if;
  if total_qty > ev.max_per_order then
    raise exception 'At most % % per order.', ev.max_per_order, case when ev.max_per_order = 1 then 'ticket' else 'tickets' end;
  end if;

  if promo.id is not null then
    -- A code that says how many tickets it covers (0296) is worked out on
    -- that many, the dearest first; one that does not, on every ticket. The
    -- one sum (0298).
    discount := public.registration_discount_on(promo_prices, promo.kind, promo.value, promo.tickets_covered);
    -- The code is counted as used when the order below is made (0300).
  end if;

  -- An invitation takes money off only as many tickets as it covers, the
  -- dearest first — a code takes it off every ticket in the order, which is
  -- how one "free" code came to mean ten free tickets. The sum is done as a
  -- code's is, rounding included; the page's orderTotals() copies it.
  if inv.id is not null and inv.discount_kind is not null then
    discount := public.registration_discount_on(eligible, inv.discount_kind, inv.discount_value, inv.tickets_covered);
  end if;

  update public.registration_orders
  set quantity = total_qty,
      subtotal_pence = subtotal,
      discount_pence = discount,
      total_pence = subtotal - discount,
      promo_code = promo.code,
      promo_code_id = promo.id,
      invite_id = inv.id,
      payment_status = case when subtotal - discount > 0 then 'awaiting' else 'not_needed' end
  where id = order_id;

  -- An invitation kept to an address (0297): the ticket goes to that
  -- address and is not handed to whoever typed it. `inv` is all nulls when
  -- there was no invitation, so this is false, never null.
  return jsonb_build_object(
    'ok', true,
    'code', case when inv.locked_email is not null then null else v_code end,
    'by_email', inv.locked_email is not null
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Putting a code on: registration_apply_promo() as it stood (0298), the same.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registration_apply_promo(p_order uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.registration_orders%rowtype;
  ev public.registration_events%rowtype;
  promo public.registration_promo_codes%rowtype;
  v_code text := upper(btrim(coalesce(p_code, '')));
  prices int[];
  discount int;
begin
  select * into o from public.registration_orders where id = p_order for update;
  if not found then raise exception 'No such registration.'; end if;
  select * into ev from public.registration_events where id = o.event_id;
  if o.status <> 'confirmed' then raise exception 'This registration was cancelled.'; end if;
  if ev.cancelled_at is not null then raise exception 'This event was cancelled.'; end if;
  -- Asked again for the code it already carries: the first answer was lost on
  -- the way back. Yes, and nothing changes — the code is not used twice.
  if o.promo_code is not null and o.promo_code = v_code then
    return jsonb_build_object('ok', true, 'discount_pence', o.discount_pence, 'total_pence', o.total_pence);
  end if;
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
  -- price each was registered at.
  select coalesce(array_agg(t.unit_price_pence), '{}') into prices
  from public.registration_order_tickets t
  join public.registration_ticket_types tt on tt.id = t.ticket_type_id
  where t.order_id = o.id and tt.kind = 'paid'
    and (cardinality(promo.ticket_type_ids) = 0 or tt.id = any (promo.ticket_type_ids));
  discount := public.registration_discount_on(prices, promo.kind, promo.value, promo.tickets_covered);
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
  -- …which counts the code as used (0300).

  return jsonb_build_object('ok', true, 'discount_pence', discount, 'total_pence', o.subtotal_pence - discount);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Taking a code off: registration_order_remove_promo() as it stood (0299),
--    no longer giving the use back by hand.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.registration_order_remove_promo(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- …which gives the code its use back (0300): its uses are the live
  -- registrations that carry it. One deleted since (the order kept its
  -- word, not its row) has no count to change.

  return jsonb_build_object('ok', true, 'discount_pence', 0, 'total_pence', o.subtotal_pence);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The attendee cancels: registration_order_cancel() as it stood (0250), the same.
-- ---------------------------------------------------------------------------

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
      refund_status = case when public.registration_money_in(o) then 'owed' else refund_status end
  where id = o.id;
  -- A cancelled registration holds no use of its code (0300), whoever cancelled it.
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. The church's marks: registration_order_mark() as it stood (0296). Put back
--    takes the code's use again, if there is one, and asks about the invitation
--    and the code before it locks the ticket types.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 7. Undo: registration_order_undo() as it stood (0299). Coming back from
--    cancelled checks the code's use, in registering's order of locks; nothing
--    is added or taken by hand.
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
      -- The use of the invitation it came by must still be there, as Put back
      -- checks (0296), and the use of its promo code (0300) — asked before the
      -- ticket types are locked, in the order registering locks them.
      if o.invite_id is not null then
        perform 1 from public.registration_invites i where i.id = o.invite_id for update;
        if exists (select 1 from public.registration_invites i
                   where i.id = o.invite_id and i.max_uses is not null
                     and public.registration_invite_uses(i.id) >= i.max_uses) then
          perform set_config('rim.registration_undoing', '', true);
          raise exception 'The invite link this registration came by has been used again since, and has no uses left. Register them again instead.';
        end if;
      end if;
      if o.promo_code_id is not null and not public.registration_promo_has_use(o.promo_code_id) then
        perform set_config('rim.registration_undoing', '', true);
        raise exception 'The promo code on this registration has been used again since, and has no uses left. Register them again instead.';
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
    end if;

    -- A promo code the press put on (0298) or took off (0299): the code's
    -- count follows the registration (0300), so nothing is added or taken
    -- here. Putting one back on uses the code again, so the code must still
    -- be there and still have the use.
    if (u.was ->> 'promo_code_id') is not null and o.promo_code_id is null then
      code_back := (u.was ->> 'promo_code_id')::uuid;
      perform 1 from public.registration_promo_codes p where p.id = code_back for update;
      if not found then
        perform set_config('rim.registration_undoing', '', true);
        raise exception 'That promo code has been deleted since. Use the menu to put a code on this registration.';
      end if;
      if not public.registration_promo_has_use(code_back) then
        perform set_config('rim.registration_undoing', '', true);
        raise exception 'That promo code has been used again since, and has no uses left.';
      end if;
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

-- ---------------------------------------------------------------------------
-- 8. The numbers as they stand, counted once: writing a code counts it.
-- ---------------------------------------------------------------------------

update public.registration_promo_codes set uses = uses;
select public.migration_done(300, '0300_a_promo_codes_uses_are_its_live_registrations', '5fce84ead90e3b811b8bcc78964cdca82bfe6bc33105588b4108f748d9b5fe37');
