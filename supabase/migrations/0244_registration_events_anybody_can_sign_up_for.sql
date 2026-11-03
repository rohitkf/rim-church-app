-- Registration: events anybody can sign up for from a link, no account
-- needed (asked for by the Owner).
--
-- The church runs conferences and courses that people outside the app
-- come to. Eventbrite did the sign-ups; now the app does. A registration
-- event has a picture, a title and a description, one or more dates (one
-- ticket covering every date, or the attendee picking a date), ticket
-- types (free, paid or a donation of the attendee's choosing), each with
-- how many there are, promo codes, a place with a map, and limits on how
-- many tickets one order may hold. Published, it has a public page at
-- /register/<slug>; an order has a ticket page at /ticket/<code> with a QR
-- code reception can scan.
--
-- No payment passes through the app (the same rule as Giving). A paid
-- order is made at once with its tickets held and "awaiting payment"; the
-- attendee pays by the church's PayPal link or bank transfer, or at
-- reception, and reports it; whoever runs registrations marks it
-- received when the money arrives. Nothing is lost if somebody closes
-- the browser at PayPal, and nobody can talk their way into "Paid".
--
-- Who may make and run them is a row in the grid, `reg.manage`: the Owner
-- always, and by default nobody else; an Admin or anybody else by the
-- church's choice in Settings › Access & Privileges, or a grant. The
-- public pages are read through security definer functions that anon may
-- call — the first in this app — and every one of them answers only about
-- a published event, or an order whose code the caller holds (12 letters
-- and digits, about 60 bits: the code is the key). Registering is also a
-- function: it checks the event is open, the numbers, the capacity (under
-- a lock, so two people cannot take the last ticket) and the promo code,
-- and writes the order itself; the orders table has no insert policy.
--
-- The event can also sit in the church diary (Events), one row a date,
-- with a Register link, kept in step by registration_sync_diary.

-- ---------------------------------------------------------------------
-- Who may run registrations.
-- ---------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('reg.manage', 'admin', '{none,all}', 'none'),
  ('reg.manage', 'head', '{none,all}', 'none'),
  ('reg.manage', 'assistant', '{none,all}', 'none'),
  ('reg.manage', 'coordinator', '{none}', 'none'),
  ('reg.manage', 'member', '{none,all}', 'none'),
  ('reg.manage', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- ---------------------------------------------------------------------
-- The tables.
-- ---------------------------------------------------------------------

create table if not exists public.registration_events (
  id uuid primary key default gen_random_uuid(),
  -- The public address: /register/<slug>.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text check (description is null or length(description) <= 20000),
  -- In the registration-images bucket, which is public.
  image_path text check (image_path is null or length(image_path) <= 300),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  -- 'all': one ticket covers every date. 'choose': the attendee picks a date,
  -- and each ticket type's quantity is per date.
  date_mode text not null default 'all' check (date_mode in ('all', 'choose')),
  location_name text check (location_name is null or length(location_name) <= 200),
  address text check (address is null or length(address) <= 500),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  check ((latitude is null) = (longitude is null)),
  -- Null: opens as soon as it is published, closes when the event starts.
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  min_per_order int not null default 1 check (min_per_order between 1 and 100),
  max_per_order int not null default 10 check (max_per_order between 1 and 100),
  check (max_per_order >= min_per_order),
  -- Ways to pay, on the ticket page: the event's own links and accounts
  -- ([{"label","url"}], [{"label","account_name","bank_name","sort_code",
  -- "account_number","iban","bic"}]), and the church's from Giving when
  -- asked. Pay at reception is the third.
  payment_links jsonb not null default '[]'::jsonb check (jsonb_typeof(payment_links) = 'array' and jsonb_array_length(payment_links) <= 10),
  payment_accounts jsonb not null default '[]'::jsonb check (jsonb_typeof(payment_accounts) = 'array' and jsonb_array_length(payment_accounts) <= 10),
  payment_use_church_giving boolean not null default true,
  payment_note text check (payment_note is null or length(payment_note) <= 2000),
  allow_pay_at_reception boolean not null default true,
  -- In the church diary too, one row a date (registration_sync_diary).
  add_to_diary boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_event_dates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.registration_events (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at > starts_at),
  label text check (label is null or length(label) <= 100),
  sort_order int not null default 0,
  -- Its row in the church diary, when the event is there.
  diary_event_id uuid references public.church_events (id) on delete set null
);
create index if not exists registration_event_dates_event_idx on public.registration_event_dates (event_id, sort_order);
create index if not exists registration_event_dates_diary_idx on public.registration_event_dates (diary_event_id);

create table if not exists public.registration_ticket_types (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.registration_events (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  description text check (description is null or length(description) <= 1000),
  kind text not null check (kind in ('free', 'paid', 'donation')),
  -- Pence. A paid ticket costs this; a donation suggests at least min_donation_pence.
  price_pence int not null default 0 check (price_pence between 0 and 1000000),
  min_donation_pence int check (min_donation_pence is null or min_donation_pence between 0 and 1000000),
  check (kind <> 'paid' or price_pence > 0),
  -- How many there are (per date when the attendee picks one); null is no limit.
  quantity int check (quantity is null or quantity between 0 and 100000),
  sort_order int not null default 0
);
create index if not exists registration_ticket_types_event_idx on public.registration_ticket_types (event_id, sort_order);

create table if not exists public.registration_promo_codes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.registration_events (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{1,29}$'),
  kind text not null check (kind in ('amount', 'percent')),
  -- Pence off, or percent off, the paid tickets it applies to.
  value int not null check (value > 0),
  check (kind <> 'percent' or value <= 100),
  -- Empty: every paid ticket type.
  ticket_type_ids uuid[] not null default '{}',
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  active boolean not null default true,
  unique (event_id, code)
);
create index if not exists registration_promo_codes_event_idx on public.registration_promo_codes (event_id);

create table if not exists public.registration_orders (
  id uuid primary key default gen_random_uuid(),
  -- The ticket's address, /ticket/<code>, and the payment reference.
  code text not null unique check (code ~ '^[A-Z0-9]{12}$'),
  event_id uuid not null references public.registration_events (id) on delete cascade,
  -- The date chosen, when the attendee picks one. A date with orders cannot
  -- be removed (the default no action): cancel them first.
  date_id uuid references public.registration_event_dates (id),
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 254),
  phone text check (phone is null or length(phone) <= 40),
  quantity int not null check (quantity between 1 and 100),
  subtotal_pence int not null default 0 check (subtotal_pence >= 0),
  discount_pence int not null default 0 check (discount_pence >= 0),
  total_pence int not null default 0 check (total_pence >= 0),
  promo_code text,
  promo_code_id uuid references public.registration_promo_codes (id) on delete set null,
  -- not_needed (free), awaiting, reported (the attendee says they paid),
  -- received (the church saw the money), waived.
  payment_status text not null check (payment_status in ('not_needed', 'awaiting', 'reported', 'received', 'waived')),
  payment_method text check (payment_method is null or payment_method in ('paypal', 'bank', 'reception')),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  -- Whoever runs registrations, to themselves.
  notes text check (notes is null or length(notes) <= 2000),
  email_sent_at timestamptz,
  -- Name, email and phone blanked (retention); the numbers stay.
  anonymised_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists registration_orders_event_idx on public.registration_orders (event_id, created_at);
create index if not exists registration_orders_date_idx on public.registration_orders (date_id);
create index if not exists registration_orders_promo_idx on public.registration_orders (promo_code_id);
create index if not exists registration_orders_email_idx on public.registration_orders (event_id, lower(email));

create table if not exists public.registration_order_tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.registration_orders (id) on delete cascade,
  -- A type with tickets sold cannot be removed (the default no action).
  ticket_type_id uuid not null references public.registration_ticket_types (id),
  attendee_name text check (attendee_name is null or length(attendee_name) <= 120),
  -- What this ticket cost: the price then, or the donation given.
  unit_price_pence int not null default 0 check (unit_price_pence >= 0)
);
create index if not exists registration_order_tickets_order_idx on public.registration_order_tickets (order_id);
create index if not exists registration_order_tickets_type_idx on public.registration_order_tickets (ticket_type_id);

-- ---------------------------------------------------------------------
-- Who may read and write them: whoever runs registrations, and nobody
-- else directly. The public reads through the functions below.
-- ---------------------------------------------------------------------

alter table public.registration_events enable row level security;
alter table public.registration_event_dates enable row level security;
alter table public.registration_ticket_types enable row level security;
alter table public.registration_promo_codes enable row level security;
alter table public.registration_orders enable row level security;
alter table public.registration_order_tickets enable row level security;

create policy registration_events_select on public.registration_events
  for select using (public.may((select auth.uid()), 'reg.manage'));
create policy registration_events_insert on public.registration_events
  for insert with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_events_update on public.registration_events
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_events_delete on public.registration_events
  for delete using (public.may((select auth.uid()), 'reg.manage'));

create policy registration_event_dates_select on public.registration_event_dates
  for select using (public.may((select auth.uid()), 'reg.manage'));
create policy registration_event_dates_insert on public.registration_event_dates
  for insert with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_event_dates_update on public.registration_event_dates
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_event_dates_delete on public.registration_event_dates
  for delete using (public.may((select auth.uid()), 'reg.manage'));

create policy registration_ticket_types_select on public.registration_ticket_types
  for select using (public.may((select auth.uid()), 'reg.manage'));
create policy registration_ticket_types_insert on public.registration_ticket_types
  for insert with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_ticket_types_update on public.registration_ticket_types
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_ticket_types_delete on public.registration_ticket_types
  for delete using (public.may((select auth.uid()), 'reg.manage'));

create policy registration_promo_codes_select on public.registration_promo_codes
  for select using (public.may((select auth.uid()), 'reg.manage'));
create policy registration_promo_codes_insert on public.registration_promo_codes
  for insert with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_promo_codes_update on public.registration_promo_codes
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_promo_codes_delete on public.registration_promo_codes
  for delete using (public.may((select auth.uid()), 'reg.manage'));

-- Orders are only ever made by registration_register(): no insert policy.
create policy registration_orders_select on public.registration_orders
  for select using (public.may((select auth.uid()), 'reg.manage'));
create policy registration_orders_update on public.registration_orders
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_orders_delete on public.registration_orders
  for delete using (public.may((select auth.uid()), 'reg.manage'));

create policy registration_order_tickets_select on public.registration_order_tickets
  for select using (public.may((select auth.uid()), 'reg.manage'));
create policy registration_order_tickets_update on public.registration_order_tickets
  for update using (public.may((select auth.uid()), 'reg.manage'))
  with check (public.may((select auth.uid()), 'reg.manage'));
create policy registration_order_tickets_delete on public.registration_order_tickets
  for delete using (public.may((select auth.uid()), 'reg.manage'));

-- Screens refetch when these change (0202).
create trigger registration_events_live after insert or update or delete on public.registration_events for each statement execute function public.live_table_changed();
create trigger registration_event_dates_live after insert or update or delete on public.registration_event_dates for each statement execute function public.live_table_changed();
create trigger registration_ticket_types_live after insert or update or delete on public.registration_ticket_types for each statement execute function public.live_table_changed();
create trigger registration_promo_codes_live after insert or update or delete on public.registration_promo_codes for each statement execute function public.live_table_changed();
create trigger registration_orders_live after insert or update or delete on public.registration_orders for each statement execute function public.live_table_changed();

-- updated_at, as every other table keeps it.
create or replace function public.registration_events_touched()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.registration_events_touched() from public, anon, authenticated;
drop trigger if exists registration_events_touched on public.registration_events;
create trigger registration_events_touched before update on public.registration_events
  for each row execute function public.registration_events_touched();

-- ---------------------------------------------------------------------
-- The pictures: a public bucket, written by whoever runs registrations.
-- ---------------------------------------------------------------------

do $buckets$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('registration-images', 'registration-images', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists registration_images_select on storage.objects;
    drop policy if exists registration_images_insert on storage.objects;
    drop policy if exists registration_images_update on storage.objects;
    drop policy if exists registration_images_delete on storage.objects;
    create policy registration_images_select on storage.objects
      for select using (bucket_id = 'registration-images');
    create policy registration_images_insert on storage.objects
      for insert with check (bucket_id = 'registration-images' and public.may(auth.uid(), 'reg.manage'));
    create policy registration_images_update on storage.objects
      for update using (bucket_id = 'registration-images' and public.may(auth.uid(), 'reg.manage'));
    create policy registration_images_delete on storage.objects
      for delete using (bucket_id = 'registration-images' and public.may(auth.uid(), 'reg.manage'));

    -- The church's logo on the public pages: the mark is public anyway.
    drop policy if exists branding_public_select on storage.objects;
    create policy branding_public_select on storage.objects
      for select using (bucket_id = 'branding');
  end if;
end $buckets$;

-- ---------------------------------------------------------------------
-- Helpers the functions below share. None of them is an RPC.
-- ---------------------------------------------------------------------

/** How many of a ticket type are sold: confirmed orders, on one date or any. */
create or replace function public.registration_sold(p_type uuid, p_date uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.registration_order_tickets t
  join public.registration_orders o on o.id = t.order_id
  where t.ticket_type_id = p_type
    and o.status = 'confirmed'
    and (p_date is null or o.date_id = p_date);
$$;
revoke all on function public.registration_sold(uuid, uuid) from public, anon, authenticated;

/** When registration for an event closes if nobody said: when it starts. */
create or replace function public.registration_closes(ev public.registration_events)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    ev.registration_closes_at,
    case when ev.date_mode = 'choose'
      then (select max(starts_at) from public.registration_event_dates where event_id = ev.id)
      else (select min(starts_at) from public.registration_event_dates where event_id = ev.id)
    end
  );
$$;
revoke all on function public.registration_closes(public.registration_events) from public, anon, authenticated;

/** A fresh order code: 12 from an alphabet with no 0/O or 1/I/L to confuse. */
create or replace function public.registration_new_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  out text := '';
  i int;
begin
  loop
    bytes := extensions.gen_random_bytes(12);
    out := '';
    for i in 0..11 loop
      out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.registration_orders where code = out);
  end loop;
  return out;
end;
$$;
revoke all on function public.registration_new_code() from public, anon, authenticated;

/** The ways to pay an order: the event's own, then the church's from Giving when asked. */
create or replace function public.registration_payment_options(ev public.registration_events)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'links', (
      select coalesce(jsonb_agg(l), '[]'::jsonb) from (
        select jsonb_build_object('label', x ->> 'label', 'url', x ->> 'url') as l
        from jsonb_array_elements(ev.payment_links) x
        where (x ->> 'url') ~* '^https://'
        union all
        select jsonb_build_object('label', g.label, 'url', g.url)
        from public.giving_links g
        where ev.payment_use_church_giving and g.url ~* '^https://'
      ) links
    ),
    'accounts', (
      select coalesce(jsonb_agg(a), '[]'::jsonb) from (
        select jsonb_build_object(
          'label', x ->> 'label', 'account_name', x ->> 'account_name', 'bank_name', x ->> 'bank_name',
          'sort_code', x ->> 'sort_code', 'account_number', x ->> 'account_number',
          'iban', x ->> 'iban', 'bic', x ->> 'bic'
        ) as a
        from jsonb_array_elements(ev.payment_accounts) x
        union all
        select jsonb_build_object(
          'label', b.label, 'account_name', b.account_name, 'bank_name', b.bank_name,
          'sort_code', b.sort_code, 'account_number', b.account_number, 'iban', b.iban, 'bic', b.bic
        )
        from public.giving_bank_accounts b
        where ev.payment_use_church_giving
      ) accounts
    )
  );
$$;
revoke all on function public.registration_payment_options(public.registration_events) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The public pages. Anyone may call these; each answers only about a
-- published event, or the order whose code the caller holds.
-- ---------------------------------------------------------------------

/**
 * The event, as its public page needs it: null when there is no such event,
 * or it is a draft (unless the caller may run registrations, who may look
 * at a draft before publishing it).
 */
create or replace function public.registration_public_event(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  closes timestamptz;
  starts timestamptz;
  open boolean;
  why text;
begin
  select * into ev from public.registration_events where slug = lower(btrim(p_slug));
  if not found then return null; end if;
  if ev.status = 'draft' and not public.may(auth.uid(), 'reg.manage') then return null; end if;

  closes := public.registration_closes(ev);
  select min(starts_at) into starts from public.registration_event_dates where event_id = ev.id;
  open := ev.status = 'published'
      and (ev.registration_opens_at is null or ev.registration_opens_at <= now())
      and (closes is null or closes > now());
  why := case
    when ev.status = 'draft' then 'draft'
    when ev.status = 'closed' then 'closed'
    when ev.registration_opens_at is not null and ev.registration_opens_at > now() then 'not_yet'
    when closes is not null and closes <= now() then 'over'
    else null
  end;

  return jsonb_build_object(
    'id', ev.id,
    'slug', ev.slug,
    'title', ev.title,
    'description', ev.description,
    'image_path', ev.image_path,
    'status', ev.status,
    'date_mode', ev.date_mode,
    'location', jsonb_build_object('name', ev.location_name, 'address', ev.address, 'latitude', ev.latitude, 'longitude', ev.longitude),
    'opens_at', ev.registration_opens_at,
    'closes_at', closes,
    'open', open,
    'closed_reason', why,
    'min_per_order', ev.min_per_order,
    'max_per_order', ev.max_per_order,
    'allow_pay_at_reception', ev.allow_pay_at_reception,
    'payment_note', ev.payment_note,
    'dates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label,
        'open', d.starts_at > now()
      ) order by d.starts_at, d.sort_order), '[]'::jsonb)
      from public.registration_event_dates d where d.event_id = ev.id
    ),
    'ticket_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'description', t.description, 'kind', t.kind,
        'price_pence', t.price_pence, 'min_donation_pence', t.min_donation_pence,
        'quantity', t.quantity,
        'remaining', case when t.quantity is null or ev.date_mode = 'choose' then null
                          else greatest(t.quantity - public.registration_sold(t.id), 0) end,
        'remaining_by_date', case when t.quantity is null or ev.date_mode <> 'choose' then '{}'::jsonb
          else (select coalesce(jsonb_object_agg(d.id::text, greatest(t.quantity - public.registration_sold(t.id, d.id), 0)), '{}'::jsonb)
                from public.registration_event_dates d where d.event_id = ev.id) end
      ) order by t.sort_order, t.name), '[]'::jsonb)
      from public.registration_ticket_types t where t.event_id = ev.id
    ),
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$$;
grant execute on function public.registration_public_event(text) to anon, authenticated;

/** What a promo code is worth, for the form to show before the order is made. */
create or replace function public.registration_promo_check(p_slug text, p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p.id is null then jsonb_build_object('ok', false)
    else jsonb_build_object('ok', true, 'code', p.code, 'kind', p.kind, 'value', p.value, 'ticket_type_ids', to_jsonb(p.ticket_type_ids))
  end
  from public.registration_events e
  left join public.registration_promo_codes p
    on p.event_id = e.id and p.code = upper(btrim(p_code)) and p.active
    and (p.max_uses is null or p.uses < p.max_uses)
  where e.slug = lower(btrim(p_slug)) and e.status = 'published';
$$;
grant execute on function public.registration_promo_check(text, text) to anon, authenticated;

/**
 * Register. p_order: {"name","email","phone","date_id","promo_code","website",
 * "lines":[{"ticket_type_id","quantity","attendee_names":[…],"donation_pence"}]}.
 * Returns {"ok":true,"code":…}. Every refusal is an exception with a
 * sentence the page can show.
 */
create or replace function public.registration_register(p_slug text, p_order jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  closes timestamptz;
  v_name text := btrim(coalesce(p_order ->> 'name', ''));
  v_email text := lower(btrim(coalesce(p_order ->> 'email', '')));
  v_phone text := nullif(btrim(coalesce(p_order ->> 'phone', '')), '');
  v_date uuid := nullif(p_order ->> 'date_id', '')::uuid;
  v_promo text := upper(btrim(coalesce(p_order ->> 'promo_code', '')));
  promo public.registration_promo_codes%rowtype;
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

    total_qty := total_qty + qty;
    subtotal := subtotal + unit * qty;
    if tt.kind = 'paid' and promo.id is not null
       and (cardinality(promo.ticket_type_ids) = 0 or tt.id = any (promo.ticket_type_ids)) then
      discountable := discountable + unit * qty;
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

  update public.registration_orders
  set quantity = total_qty,
      subtotal_pence = subtotal,
      discount_pence = discount,
      total_pence = subtotal - discount,
      promo_code = promo.code,
      promo_code_id = promo.id,
      payment_status = case when subtotal - discount > 0 then 'awaiting' else 'not_needed' end
  where id = order_id;

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;
grant execute on function public.registration_register(text, jsonb) to anon, authenticated;

/** The ticket: everything about the order whose code this is, or null. */
create or replace function public.registration_order_view(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
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
      'slug', ev.slug, 'title', ev.title, 'image_path', ev.image_path, 'status', ev.status, 'date_mode', ev.date_mode,
      'location', jsonb_build_object('name', ev.location_name, 'address', ev.address, 'latitude', ev.latitude, 'longitude', ev.longitude),
      'allow_pay_at_reception', ev.allow_pay_at_reception,
      'payment_note', ev.payment_note,
      'dates', (
        select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'starts_at', d.starts_at, 'ends_at', d.ends_at, 'label', d.label)
                                  order by d.starts_at, d.sort_order), '[]'::jsonb)
        from public.registration_event_dates d where d.event_id = ev.id
      )
    ),
    'payment', public.registration_payment_options(ev),
    'logo_path', (select logo_url from public.app_settings limit 1)
  );
end;
$$;
grant execute on function public.registration_order_view(text) to anon, authenticated;

/**
 * The attendee says how they are paying, and whether it is done:
 * 'paypal' or 'bank' with p_done marks the order Reported (the church
 * confirms); 'reception' leaves it awaiting, to be paid at the door.
 */
create or replace function public.registration_order_payment(p_code text, p_method text, p_done boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  ev public.registration_events%rowtype;
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code)) for update;
  if not found or o.status <> 'confirmed' then raise exception 'That ticket is not open.'; end if;
  if o.payment_status not in ('awaiting', 'reported') then raise exception 'This order does not need a payment.'; end if;
  if p_method not in ('paypal', 'bank', 'reception') then raise exception 'Choose how you are paying.'; end if;
  select * into ev from public.registration_events where id = o.event_id;
  if p_method = 'reception' and not ev.allow_pay_at_reception then raise exception 'Paying at reception is not offered for this event.'; end if;

  update public.registration_orders
  set payment_method = p_method,
      payment_status = case when p_method <> 'reception' and p_done then 'reported' else 'awaiting' end
  where id = o.id;
end;
$$;
grant execute on function public.registration_order_payment(text, text, boolean) to anon, authenticated;

/** The attendee cancels, before the event starts; the tickets are freed. */
create or replace function public.registration_order_cancel(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  starts timestamptz;
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'No such ticket.'; end if;
  if o.status = 'cancelled' then return; end if;
  select coalesce(
    (select d.starts_at from public.registration_event_dates d where d.id = o.date_id),
    (select min(d.starts_at) from public.registration_event_dates d where d.event_id = o.event_id)
  ) into starts;
  if starts is not null and starts <= now() then raise exception 'The event has started; this ticket can no longer be cancelled.'; end if;

  update public.registration_orders set status = 'cancelled', cancelled_at = now() where id = o.id;
  if o.promo_code_id is not null then
    update public.registration_promo_codes set uses = greatest(uses - 1, 0) where id = o.promo_code_id;
  end if;
end;
$$;
grant execute on function public.registration_order_cancel(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- The church diary: one row a date, with a Register link, while the event
-- is published and asked to be there.
-- ---------------------------------------------------------------------

create or replace function public.registration_sync_diary(p_event uuid, p_register_url text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  d record;
  tz text := public.church_timezone();
  row_id uuid;
begin
  if not public.may(auth.uid(), 'reg.manage') then
    raise exception 'Running registrations is not open to you.' using errcode = '42501';
  end if;
  select * into ev from public.registration_events where id = p_event;
  if not found then return; end if;

  if not ev.add_to_diary or ev.status <> 'published' then
    delete from public.church_events e
    where e.id in (select diary_event_id from public.registration_event_dates where event_id = ev.id and diary_event_id is not null);
    return;
  end if;

  for d in select * from public.registration_event_dates where event_id = ev.id order by starts_at loop
    row_id := d.diary_event_id;
    if row_id is not null and not exists (select 1 from public.church_events where id = row_id) then
      row_id := null;
    end if;
    if row_id is null then
      insert into public.church_events (title, details, event_date, ends_on, start_time, end_time, location, department_ids, links, created_by)
      values (
        ev.title,
        left(ev.description, 2000),
        (d.starts_at at time zone tz)::date,
        case when d.ends_at is not null and (d.ends_at at time zone tz)::date > (d.starts_at at time zone tz)::date
             then (d.ends_at at time zone tz)::date end,
        (d.starts_at at time zone tz)::time,
        (d.ends_at at time zone tz)::time,
        coalesce(ev.location_name, ev.address),
        '{}',
        jsonb_build_array(jsonb_build_object('label', 'Register', 'url', p_register_url)),
        auth.uid()
      )
      returning id into row_id;
      update public.registration_event_dates set diary_event_id = row_id where id = d.id;
    else
      update public.church_events
      set title = ev.title,
          details = left(ev.description, 2000),
          event_date = (d.starts_at at time zone tz)::date,
          ends_on = case when d.ends_at is not null and (d.ends_at at time zone tz)::date > (d.starts_at at time zone tz)::date
                         then (d.ends_at at time zone tz)::date end,
          start_time = (d.starts_at at time zone tz)::time,
          end_time = (d.ends_at at time zone tz)::time,
          location = coalesce(ev.location_name, ev.address),
          links = jsonb_build_array(jsonb_build_object('label', 'Register', 'url', p_register_url))
      where id = row_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.registration_sync_diary(uuid, text) from public, anon;
grant execute on function public.registration_sync_diary(uuid, text) to authenticated;

notify pgrst, 'reload schema';
