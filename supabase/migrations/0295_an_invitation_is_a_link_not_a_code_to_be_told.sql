/*
 * 0295 — an invitation is a link, not a code to be told
 *
 * Until now the only way to take money off a ticket was a promo code, and
 * a code has to be told: in a message, in plain words, next to the link.
 * Whoever is told it can tell anybody, the ticket page prints it back
 * ("Promo code FREE100"), and a code worth 100% takes the price off every
 * ticket in the order — up to the event's most per order, ten out of the
 * box — so one leaked word was ten free places at a time. The Owner asked
 * for a link that carries the discount itself, with nothing to read off
 * it and nothing to pass on.
 *
 * An invitation (`registration_invites`) is that link:
 * /register/<slug>?invite=<token>. The token is twelve letters and digits
 * the database makes (about sixty bits, the same alphabet as a ticket's
 * code), it is the only thing in the link, and it means nothing without
 * the row it names. The discount lives on the invitation — an amount or a
 * percentage, which ticket types, and how many tickets it covers — so
 * there is no code behind it that could be typed or guessed. Promo codes
 * stay exactly as they were, for posters.
 *
 * Two kinds, because "a free place for John" and "money off for the youth
 * group" want different care:
 *
 *   personal   for one person. Kept to one email address (the one they
 *              register with must be it) and used once. Forwarded, it is
 *              no use to anybody else.
 *   group      for whoever holds the link. With a discount it must say
 *              how many times it can be used; a group link that makes
 *              tickets free can be used twenty times at most. Without a
 *              discount it only records who brought whom, and needs no
 *              limit.
 *
 * Both may end on a date (`expires_at`) and can be turned off (`active`)
 * one link at a time, which is what a leak calls for: the others go on
 * working.
 *
 * How many times one has been used is not a number kept on the row. It is
 * counted — the live orders that came by it (`registration_invite_uses`)
 * — so cancelling an order gives the use back and putting one back takes
 * it again, by whoever and however that was done, Undo included. A code's
 * `uses` is a kept number, and only the attendee's own cancellation ever
 * gave one back.
 *
 * An invitation covers a number of tickets (`tickets_covered`, one out of
 * the box): the discount is worked out on that many of the order's
 * tickets it applies to, the dearest first, and anything more in the same
 * order is at its full price. An amount is still an amount off the order,
 * never more than those tickets come to.
 *
 * What the public is told. `registration_invite_check(slug, token)` is
 * open to anybody, like the page it is for, and answers only what the
 * form needs to show the right total: whether the link still works (and
 * if not, whether it ran out or was used up), what it takes off, how many
 * tickets, and *whether* it is kept to an address — never the address,
 * never the label the church gave it, never anything about another
 * invitation. The form does not fill the address in either: a forwarded
 * link would otherwise hand a stranger somebody's email.
 * `registration_register()` asks all of it again under a lock on the
 * invitation's row, and an invitation and a code are never both taken:
 * the invitation wins.
 *
 * The ticket (`registration_order_view`) says `invited`, so the page can
 * write "Invitation" where it would have printed a code. The token is on
 * no page after the form: registering goes to the ticket's own address.
 *
 * Who. Reading an event's invitations is any office right
 * (`registration_can(uid, 'office')`), and making, changing, turning off
 * and deleting them is "Make & edit events" (`'edit'`) — the same two as
 * promo codes, which are the same kind of decision. No new right. The
 * token, the event, and who made it and when are the database's: a
 * trigger makes the token on insert whatever the app sent, and keeps all
 * four as they were on every update.
 *
 * Letting go. An invitation is its event's: deleted with it, and blanked
 * with its orders by the nightly `registration_anonymise()` — the label
 * (often a name) and the address go, and the link is turned off. The
 * order keeps `invite_id`, so the ticket still reads "Invitation".
 *
 * Compatible with the app in production: it never sends `invite`, reads
 * `registration_orders` by named columns, and takes an answer with a key
 * it does not know.
 */

-- ---------------------------------------------------------------------------
-- 1. The invitations.
-- ---------------------------------------------------------------------------
create table public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.registration_events (id) on delete cascade,
  -- What the link carries. Made by registration_invites_guard(), never by the app.
  token text not null unique check (token ~ '^[A-Z0-9]{12}$'),
  -- The church's own word for it: who it is for. Never shown to the public.
  label text not null check (length(label) between 1 and 80),
  kind text not null check (kind in ('personal', 'group')),
  -- Personal: the one address that may use it, lower case.
  locked_email text check (
    locked_email is null
    or (length(locked_email) <= 254 and locked_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  ),
  -- Null and null: no discount, it only records who came by it.
  discount_kind text check (discount_kind in ('amount', 'percent')),
  -- Pence off, or percent off, the tickets it covers.
  discount_value int check (discount_value > 0),
  -- Empty: every paid ticket type.
  ticket_type_ids uuid[] not null default '{}',
  -- How many of an order's tickets the discount is worked out on, the dearest first.
  tickets_covered int not null default 1 check (tickets_covered between 1 and 100),
  -- How many live orders may come by it. Null: no limit.
  max_uses int check (max_uses between 1 and 10000),
  expires_at timestamptz,
  active boolean not null default true,
  -- Blanked with its event's orders (registration_anonymise).
  anonymised_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint registration_invites_discount_whole check ((discount_kind is null) = (discount_value is null)),
  constraint registration_invites_percent check (discount_kind is distinct from 'percent' or discount_value <= 100),
  -- Personal: one address, one use. (Anonymised, the address has gone.)
  constraint registration_invites_personal check (
    kind <> 'personal' or (max_uses is not distinct from 1 and (locked_email is not null or anonymised_at is not null))
  ),
  -- Group: no address; with a discount, a limit; making tickets free, twenty at most.
  constraint registration_invites_group check (
    kind <> 'group' or (locked_email is null and (discount_kind is null or max_uses is not null))
  ),
  constraint registration_invites_free_group check (
    not (kind = 'group' and discount_kind is not distinct from 'percent'
         and discount_value is not distinct from 100 and coalesce(max_uses, 10000) > 20)
  )
);
create index registration_invites_event_idx on public.registration_invites (event_id, created_at desc);

comment on table public.registration_invites is
  'Invitation links to a registration event (0295): /register/<slug>?invite=<token>. The link carries the discount; there is no code behind it.';

alter table public.registration_orders
  add column invite_id uuid references public.registration_invites (id) on delete set null;
create index registration_orders_invite_idx on public.registration_orders (invite_id) where invite_id is not null;
comment on column public.registration_orders.invite_id is
  'The invitation link this order came by (0295), if any. Its uses are counted from here.';

/**
 * The token, the event, and who made it and when are the database's own.
 * On insert the token is made here whatever was sent; on update all four
 * stay as they were. The address is kept lower case and trimmed, as
 * registration_register() compares it.
 *
 * The token's letters come from gen_random_uuid(), which is the server's
 * strong random source and needs no extension: twelve of the bytes that
 * are wholly random (a version-4 uuid fixes six bits, in its seventh and
 * ninth bytes, which are left out).
 */
create or replace function public.registration_invites_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  spots constant int[] := array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14];
  bytes bytea;
  made text;
  i int;
begin
  if tg_op = 'INSERT' then
    loop
      bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
      made := '';
      foreach i in array spots loop
        made := made || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
      end loop;
      exit when not exists (select 1 from public.registration_invites where token = made);
    end loop;
    new.token := made;
    new.created_by := auth.uid();
    new.created_at := now();
    new.anonymised_at := null;
  else
    new.token := old.token;
    new.event_id := old.event_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- Blanking is the nightly job's (nobody signed in); nobody undoes it.
    if auth.uid() is not null then new.anonymised_at := old.anonymised_at; end if;
  end if;
  new.label := btrim(new.label);
  new.locked_email := nullif(lower(btrim(new.locked_email)), '');
  return new;
end;
$$;
revoke all on function public.registration_invites_guard() from public, anon, authenticated;

create trigger registration_invites_guard
  before insert or update on public.registration_invites
  for each row execute function public.registration_invites_guard();

-- Every screen showing them refetches when one changes (0202).
create trigger registration_invites_live
  after insert or update or delete on public.registration_invites
  for each statement execute function public.live_table_changed();

alter table public.registration_invites enable row level security;
revoke all on public.registration_invites from anon, authenticated;
grant select, insert, update, delete on public.registration_invites to authenticated;

-- The same two rules as promo codes (0251): any office right reads them,
-- "Make & edit events" writes them.
create policy registration_invites_select on public.registration_invites
  for select to authenticated
  using ((select public.registration_can((select auth.uid()), 'office')));
create policy registration_invites_insert on public.registration_invites
  for insert to authenticated
  with check ((select public.registration_can((select auth.uid()), 'edit')));
create policy registration_invites_update on public.registration_invites
  for update to authenticated
  using ((select public.registration_can((select auth.uid()), 'edit')))
  with check ((select public.registration_can((select auth.uid()), 'edit')));
create policy registration_invites_delete on public.registration_invites
  for delete to authenticated
  using ((select public.registration_can((select auth.uid()), 'edit')));

-- ---------------------------------------------------------------------------
-- 2. How many times an invitation has been used: its live orders, counted.
--    Only definer code asks.
-- ---------------------------------------------------------------------------
create or replace function public.registration_invite_uses(p_invite uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.registration_orders o
  where o.invite_id = p_invite and o.status = 'confirmed';
$$;
revoke all on function public.registration_invite_uses(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the form is told about the link it was opened with.
--    {"ok": false, "reason": "not_found" | "ended" | "used"}, or
--    {"ok": true, "email_locked": bool,
--     "discount": null | {"kind", "value", "ticket_type_ids", "tickets_covered"}}
--    Never the label, never the address.
-- ---------------------------------------------------------------------------
create or replace function public.registration_invite_check(p_slug text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  inv public.registration_invites%rowtype;
begin
  select i.* into inv
  from public.registration_invites i
  join public.registration_events e on e.id = i.event_id
  where e.slug = lower(btrim(coalesce(p_slug, '')))
    and i.token = upper(btrim(coalesce(p_token, '')));
  if not found or inv.anonymised_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not inv.active or (inv.expires_at is not null and inv.expires_at <= now()) then
    return jsonb_build_object('ok', false, 'reason', 'ended');
  end if;
  if inv.max_uses is not null and public.registration_invite_uses(inv.id) >= inv.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'used');
  end if;
  return jsonb_build_object(
    'ok', true,
    'email_locked', inv.locked_email is not null,
    'discount', case
      when inv.discount_kind is null then null
      else jsonb_build_object(
        'kind', inv.discount_kind,
        'value', inv.discount_value,
        'ticket_type_ids', to_jsonb(inv.ticket_type_ids),
        'tickets_covered', inv.tickets_covered)
    end
  );
end;
$$;
revoke all on function public.registration_invite_check(text, text) from public;
grant execute on function public.registration_invite_check(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Registering: registration_register() as it stood (0245), taking an
--    invitation as well as a code.
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
-- 5. The ticket: registration_order_view() as it stood (0283), saying
--    whether the order came by an invitation.
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
    'promo_code', o.promo_code,
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

-- ---------------------------------------------------------------------------
-- 6. Letting go: registration_anonymise() as it stood (0287), blanking an
--    event's invitations with its orders.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_anonymise()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  keep_days integer := (select registration_retention_days from public.app_settings limit 1);
begin
  if keep_days is null then return; end if;
  create temp table if not exists _reg_done (event_id uuid primary key) on commit drop;
  insert into _reg_done
  select e.id from public.registration_events e
  where (select max(coalesce(d.ends_at, d.starts_at)) from public.registration_event_dates d where d.event_id = e.id)
        < now() - make_interval(days => keep_days);
  delete from public.registration_messages m
  where m.event_id in (select event_id from _reg_done);
  update public.registration_order_tickets t
  set attendee_name = null
  from public.registration_orders o
  where t.order_id = o.id and o.anonymised_at is null and t.attendee_name is not null
    and o.event_id in (select event_id from _reg_done);
  update public.registration_orders o
  set name = 'Anonymised',
      email = 'anonymised@removed.invalid',
      phone = null,
      notes = null,
      email_ref = null,
      email_status = null,
      email_status_at = null,
      email_status_detail = null,
      email_before = null,
      proof_path = null,
      proof_reference = null,
      anonymised_at = now()
  where o.anonymised_at is null and o.event_id in (select event_id from _reg_done);
  -- Its invitations (0295): who each was for, and the address it was kept to.
  update public.registration_invites i
  set label = 'Anonymised', locked_email = null, active = false, anonymised_at = now()
  where i.anonymised_at is null and i.event_id in (select event_id from _reg_done);
  -- An event anonymised before this let go of nothing; do those once.
  update public.registration_orders o
  set proof_path = null, proof_reference = null
  where o.anonymised_at is not null and (o.proof_path is not null or o.proof_reference is not null);
end;
$function$;
select public.migration_done(295, '0295_an_invitation_is_a_link_not_a_code_to_be_told', 'fbdd9d4f028f0659aaa82133eaa5ca76cf5ded7bbb5a029b57e2bf5de1b4b283');
