/*
 * 0296 — a code covers as many tickets as it says, and the ticket does not print it
 *
 * Two things a promo code still did after 0295 gave discounts a link of
 * their own, and both are how a code gets about.
 *
 * 1. A code took its discount off every ticket in the order.
 *
 *    A 100% code meant for one free place made every ticket in the order
 *    free, up to the event's most per order — ten out of the box. An
 *    invitation already says how many tickets it covers; now a code can
 *    too. `registration_promo_codes.tickets_covered`: null, which every
 *    code that exists is, means every ticket, exactly as before; a number
 *    means the discount is worked out on that many of the order's tickets
 *    the code applies to, the dearest first, and the rest are at their
 *    full price. An amount is still an amount off the order, never more
 *    than those tickets come to. `registration_promo_check()` tells the
 *    form the number, so the page's total is the database's.
 *
 * 2. The ticket page printed the code back.
 *
 *    "Promo code FREE100", on a page people screenshot and forward as
 *    their ticket. `registration_order_view()` no longer hands the code
 *    out: `promo_code` is always null (the key stays, because the page's
 *    schema asks for it) and a new `promo` says whether there was one, so
 *    the ticket reads "Promo code" with the sum and not the word. Whoever
 *    used it typed it and needs no reminding; the office still sees it on
 *    the registration, at Reception and in the export, which read the
 *    order's own row.
 *
 * Compatible with the app in production: it reads `promo_code` as
 * nullable and says "Discount" where there is none, it never sends
 * `tickets_covered` (an update that leaves the column out keeps it), and
 * it takes an answer with a key it does not know.
 */

-- ---------------------------------------------------------------------------
-- 1. How many of an order's tickets a code's discount is worked out on.
--    Null: every ticket it applies to, as it always was.
-- ---------------------------------------------------------------------------
alter table public.registration_promo_codes
  add column tickets_covered int check (tickets_covered between 1 and 100);
comment on column public.registration_promo_codes.tickets_covered is
  'How many of an order''s tickets the code''s discount is worked out on, the dearest first (0296). Null: every ticket it applies to.';

-- ---------------------------------------------------------------------------
-- 2. What a code is worth, for the form: registration_promo_check() as it stood
--    (0244), saying how many tickets too.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_promo_check(p_slug text, p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when p.id is null then jsonb_build_object('ok', false)
    else jsonb_build_object('ok', true, 'code', p.code, 'kind', p.kind, 'value', p.value, 'ticket_type_ids', to_jsonb(p.ticket_type_ids),
                            'tickets_covered', p.tickets_covered)
  end
  from public.registration_events e
  left join public.registration_promo_codes p
    on p.event_id = e.id and p.code = upper(btrim(p_code)) and p.active
    and (p.max_uses is null or p.uses < p.max_uses)
  where e.slug = lower(btrim(p_slug)) and e.status = 'published';
$function$;

-- ---------------------------------------------------------------------------
-- 3. Registering: registration_register() as it stood (0295), working a code
--    that says how many tickets it covers out on that many.
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

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. The ticket: registration_order_view() as it stood (0295), keeping the
--    code to itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_order_view(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.registration_orders%rowtype;
  ev public.registration_events%rowtype;
  starts timestamptz;
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code));
  if not found then return null; end if;
  select * into ev from public.registration_events where id = o.event_id;
  select coalesce(
    (select d.starts_at from public.registration_event_dates d where d.id = o.date_id),
    (select min(d.starts_at) from public.registration_event_dates d where d.event_id = ev.id)
  ) into starts;

  return jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'name', o.name,
    'email', o.email,
    'phone', o.phone,
    'quantity', o.quantity,
    'subtotal_pence', o.subtotal_pence,
    'discount_pence', o.discount_pence,
    'total_pence', o.total_pence,
    -- The code itself is not handed back (0296): a ticket is a page people
    -- pass on. The key stays, null; `promo` says whether there was one.
    'promo_code', null::text,
    'promo', o.promo_code is not null,
    -- Came by an invitation link (0295): the ticket says so, and never the token.
    'invited', o.invite_id is not null,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'proof_at', o.proof_at,
    'proof_reference', o.proof_reference,
    'source', o.source,
    'checked_in_at', o.checked_in_at,
    'created_at', o.created_at,
    'can_cancel', o.status = 'confirmed' and (starts is null or starts > now()),
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type_name', t.name, 'kind', t.kind, 'attendee_name', x.attendee_name, 'unit_price_pence', x.unit_price_pence
      ) order by t.sort_order, x.id), '[]'::jsonb)
      from public.registration_order_tickets x
      join public.registration_ticket_types t on t.id = x.ticket_type_id
      where x.order_id = o.id
    ),
    'date', (
      select jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label)
      from public.registration_event_dates d where d.id = o.date_id
    ),
    'event', jsonb_build_object(
      'slug', ev.slug, 'title', ev.title, 'image_path', ev.image_path,
      'image_focus', jsonb_build_object('x', ev.image_focus_x, 'y', ev.image_focus_y), 'status', ev.status, 'date_mode', ev.date_mode,
      'location', jsonb_build_object('name', ev.location_name, 'address', ev.address, 'latitude', ev.latitude, 'longitude', ev.longitude),
      'attendance', ev.attendance,
      'cancelled_at', ev.cancelled_at,
      'cancel_note', ev.cancel_note,
      'allow_pay_at_reception', ev.allow_pay_at_reception,
      'payment_note', ev.payment_note,
      'dates', (
        select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label)
                                  order by d.starts_at, d.sort_order), '[]'::jsonb)
        from public.registration_event_dates d where d.event_id = ev.id
      )
    ),
    -- The way in, for an event online: only on a live order that has nothing
    -- left to pay, so a link cannot be passed round before the money is in.
    'join', case
      when ev.attendance <> 'in_person' and o.status = 'confirmed' and ev.cancelled_at is null
           and o.payment_status in ('not_needed', 'received', 'waived')
      then jsonb_build_object('url', ev.join_url, 'details', ev.join_details)
      else null
    end,
    'refund_status', o.refund_status,
    'refund_at', o.refund_at,
    'refund_details_wanted', public.registration_refund_needs_details(o),
    'refund_details_sent', exists (select 1 from public.registration_refund_details r where r.order_id = o.id),
    -- What became of the email to the address above (0283).
    'email_state', case
      when o.email is null or o.anonymised_at is not null then 'none'
      when public.registration_email_bounced(o.email_status) then 'bounced'
      when o.email_status in ('delivered', 'complained') then 'delivered'
      when o.email_status in ('sent', 'delayed') then 'waiting'
      else 'none'
    end,
    'email_can_fix', o.status = 'confirmed' and o.anonymised_at is null
                     and public.registration_email_bounced(o.email_status) and o.email_fixes < 3,
    'payment', public.registration_payment_options(ev),
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$function$;
select public.migration_done(296, '0296_a_code_covers_as_many_tickets_as_it_says', '5e72f56f9c0ab11fa5ac64c5647e5c40b46256d5258047684ec74873aab12d44');
