/*
 * 0297 — a personal invitation's ticket goes to its address, and nowhere else
 *
 * A personal invitation (0295) is kept to one email address: registering
 * with any other is refused. But the address was all that was asked —
 * somebody holding a forwarded link who also knew the invitee's address
 * could type it, register, and be handed the ticket on the screen. The
 * invitation was spent and the wrong person held what it gave.
 *
 * Knowing an address is not having it. So for an order made by an
 * invitation that is kept to an address, `registration_register()` no
 * longer answers with the order's code: it answers
 * `{"ok": true, "code": null, "by_email": true}`, and the ticket reaches
 * the one place only the invitee can open — their inbox. The page says
 * so ("check your email") and asks the email function for the tickets
 * that address holds (`{kind: 'resend'}`, which only ever writes to the
 * address an order is under). Everybody else's answer is as it was, with
 * `by_email` false.
 *
 * Nothing else knows the code without being given it: the ticket page
 * needs it, "Get your ticket again" emails it, and the office reads it
 * from the order's row.
 *
 * THIS ONE WAITS FOR THE RELEASE (AGENTS.md §7, trap 3). The app before
 * it reads an answer with no code as nothing having happened — no ticket,
 * no email, the form still there — so it is applied only once the release
 * that understands `by_email` is live, and `SCHEMA_WAITS` names it until
 * then.
 */

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
  discountable int := 0;
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
      discountable := discountable + unit * qty;
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
    -- that many, the dearest first; one that does not, on every ticket.
    if promo.tickets_covered is not null then
      select coalesce(sum(x.price), 0)::int into discountable
      from (select u.price from unnest(promo_prices) as u(price) order by u.price desc limit promo.tickets_covered) x;
    end if;
    discount := case promo.kind
      when 'amount' then least(promo.value, discountable)
      else (discountable * promo.value / 100.0)::int
    end;
    update public.registration_promo_codes set uses = uses + 1 where id = promo.id;
  end if;

  -- An invitation takes money off only as many tickets as it covers, the
  -- dearest first — a code takes it off every ticket in the order, which is
  -- how one "free" code came to mean ten free tickets. The sum is done as a
  -- code's is, rounding included; the page's orderTotals() copies it.
  if inv.id is not null and inv.discount_kind is not null then
    select coalesce(sum(x.price), 0)::int into discountable
    from (select u.price from unnest(eligible) as u(price) order by u.price desc limit inv.tickets_covered) x;
    discount := case inv.discount_kind
      when 'amount' then least(inv.discount_value, discountable)
      else (discountable * inv.discount_value / 100.0)::int
    end;
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
select public.migration_done(297, '0297_a_personal_invitations_ticket_goes_to_its_address', '767791d5c7d26f005c882741ff5dc77ab9cc25f383c7647fa413793699f5447b');
