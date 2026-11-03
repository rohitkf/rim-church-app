-- The picture's focal point (asked for by the Owner after the first real
-- event): the picture at the top of an event's page is shown 16:9,
-- cropped to fit, and a tall poster or a wide banner lost its subject at
-- the edges. The church now picks the point that must stay in view —
-- `image_focus_x` and `image_focus_y`, each 0–100, the middle by default
-- — and the pages place the picture by it (CSS object-position). The two
-- public functions carry it out as `image_focus`.

alter table public.registration_events
  add column if not exists image_focus_x smallint not null default 50 check (image_focus_x between 0 and 100),
  add column if not exists image_focus_y smallint not null default 50 check (image_focus_y between 0 and 100);
comment on column public.registration_events.image_focus_x is 'Where the picture''s subject is, left to right, 0–100: the point kept in view when it is cropped.';
comment on column public.registration_events.image_focus_y is 'Where the picture''s subject is, top to bottom, 0–100.';

-- The public page learns where to place the picture.
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
    'image_focus', jsonb_build_object('x', ev.image_focus_x, 'y', ev.image_focus_y),
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

-- And the ticket page.
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
