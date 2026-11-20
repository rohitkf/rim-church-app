/*
 * Reception for some events only (asked for by the Owner on 20 November
 * 2026, during the Pastors' & Leaders Conference).
 *
 * Whoever is given Reception had it for every event the church runs: the
 * door's rights are grants (0208), and a grant knows nothing of events.
 * Somebody put on the door for the conference could open the youth camp's
 * list too, with its names, its phone numbers and its money.
 *
 * So each holder of Reception — a person, or a team — can be kept to the
 * events chosen for them (Settings › Reception). Nothing is chosen for
 * anybody today, and somebody with nothing chosen has every event, as
 * before: this migration changes what nobody can do until a limit is set.
 *
 * 1. Where a limit lives.
 *    reception_event_limits: one row per limited holder, with the events
 *    they may work. A row is the limit; no row is every event. The list is
 *    an array on the row and not a row per event on purpose: when an event
 *    is deleted the holder is left with fewer events, or none — never,
 *    by the last row going, with all of them.
 *
 * 2. Who a limit binds.
 *    Only somebody who holds the door through holders that are all
 *    limited. The Owner, an Admin and whoever runs registrations
 *    (registration_can 'office') are not the door's to limit. Somebody on
 *    two limited holders — by name, and on a team — has the events of
 *    both. Somebody with one holder that is not limited has every event.
 *
 * 3. What it keeps them from.
 *    Reading: the events themselves, their dates, agenda and ticket
 *    types, their registrations and tickets, their promo codes — each of
 *    those row rules now asks for the event as well as the right. Receipt
 *    files, which Reception never shows, are not open to somebody limited
 *    at all.
 *    Doing: the six things a door can do to a registration —
 *    registration_order_mark (check in, payments, waive, cancel),
 *    _note, _apply_promo, _set_email, _undo and registration_walk_in —
 *    each refuse an event that is not theirs. Their bodies are as they
 *    stood on production, with that one line added.
 *
 * 4. What is left.
 *    Sending a ticket's email again is checked by the edge function
 *    registration-email, which asks registration_can() without the event.
 *    Somebody limited who knew another event's ticket code could have that
 *    attendee's own ticket sent to that attendee again; they cannot read
 *    the code from the app. Closing it is a change to that function, which
 *    is deployed only on the Owner's word.
 *
 * Changing the limits is for whoever may change Access & Privileges
 * (app.permissions), like the ticks beside them.
 */

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.reception_event_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  event_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint reception_event_limits_one_holder check ((user_id is null) <> (department_id is null)),
  constraint reception_event_limits_not_endless check (cardinality(event_ids) <= 500)
);

create unique index reception_event_limits_person_idx on public.reception_event_limits (user_id) where user_id is not null;
create unique index reception_event_limits_team_idx on public.reception_event_limits (department_id) where department_id is not null;
create index reception_event_limits_updated_by_idx on public.reception_event_limits (updated_by);

comment on table public.reception_event_limits is
  'Reception for some events only (0313): a holder of the door (a person or a team) kept to the events listed. A row is the limit; no row is every event. Read through reception_event_limits_state(), written through set_reception_event_limits().';

-- Like the lock (0288): nobody reads or writes the table itself.
alter table public.reception_event_limits enable row level security;
revoke all on table public.reception_event_limits from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who is limited, and to what
-- ---------------------------------------------------------------------------

-- The holders this person has the door through: their own name, and each team
-- they are on or head — read exactly as may() reads a grant (0208, 0218).
create or replace function public.reception_door_holders(uid uuid)
returns table (user_id uuid, department_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct g.user_id, g.department_id
  from public.permission_grants g
  where g.capability in ('reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_view', 'reg.door_fix')
    and (g.expires_at is null or g.expires_at > now())
    and (
      g.user_id = uid
      or (g.department_id is not null and (
        (not g.leads_only and exists (
          select 1 from public.department_members m where m.department_id = g.department_id and m.user_id = uid
        ))
        or exists (
          select 1 from public.user_roles r
          where r.user_id = uid and r.department_id = g.department_id
            and r.role_type in ('department_head', 'assisting_head')
        )
      ))
    )
$$;

comment on function public.reception_door_holders(uuid) is
  'The Reception holders (0313) a person has the door through: their own grant, and each team''s they are on or head.';

revoke all on function public.reception_door_holders(uuid) from public, anon, authenticated;

-- The events this person is kept to, or null when they are not kept to any.
create or replace function public.reception_limited_events(uid uuid)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  theirs uuid[];
begin
  if uid is null then
    return null;
  end if;
  -- Nobody has been limited: every answer as it was, for the price of looking.
  if not exists (select 1 from public.reception_event_limits) then
    return null;
  end if;
  -- Whoever runs registrations is not the door's to limit; nor the Owner or an Admin, who are among them.
  if public.registration_can(uid, 'office') then
    return null;
  end if;
  -- The door through no holder at all: whatever they may do, a role gave it.
  if not exists (select 1 from public.reception_door_holders(uid)) then
    return null;
  end if;
  -- One holder with nothing chosen for it is every event.
  if exists (
    select 1 from public.reception_door_holders(uid) h
    where not exists (
      select 1 from public.reception_event_limits l
      where l.user_id is not distinct from h.user_id and l.department_id is not distinct from h.department_id
    )
  ) then
    return null;
  end if;
  -- Every holder is limited: the events of all of them.
  select coalesce(array_agg(distinct e.id), '{}')
  into theirs
  from public.reception_door_holders(uid) h
  join public.reception_event_limits l
    on l.user_id is not distinct from h.user_id and l.department_id is not distinct from h.department_id
  cross join lateral unnest(l.event_ids) as e (id);
  return theirs;
end
$$;

comment on function public.reception_limited_events(uuid) is
  'The events somebody at Reception is kept to (0313), or null when they are not kept to any: the Owner, an Admin, whoever runs registrations, and anybody with a holder nothing was chosen for.';

revoke all on function public.reception_limited_events(uuid) from public, anon;
grant execute on function public.reception_limited_events(uuid) to authenticated, service_role;

create or replace function public.registration_event_open(uid uuid, ev uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select x.theirs is null or ev = any (x.theirs)
  from (select public.reception_limited_events(uid) as theirs) x
$$;

comment on function public.registration_event_open(uuid, uuid) is
  'Whether this event is one this person may work Reception for (0313). True for anybody not limited. It is asked beside registration_can(), never instead of it.';

revoke all on function public.registration_event_open(uuid, uuid) from public, anon;
grant execute on function public.registration_event_open(uuid, uuid) to authenticated, service_role;

-- What the six functions below call: refuse an event that is not the caller's.
create or replace function public.registration_event_guard(ev uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.registration_event_open(auth.uid(), ev) then
    raise exception 'That event is not one you work Reception for.' using errcode = '42501';
  end if;
end
$$;

create or replace function public.registration_order_guard(p_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ev uuid;
begin
  select o.event_id into ev from public.registration_orders o where o.id = p_id;
  -- A registration that is not there is the caller's own "no such registration" to say.
  if found then
    perform public.registration_event_guard(ev);
  end if;
end
$$;

comment on function public.registration_event_guard(uuid) is 'Refuses (42501) an event the caller is not given Reception for (0313). Called by the door''s own functions.';
comment on function public.registration_order_guard(uuid) is 'Refuses (42501) a registration of an event the caller is not given Reception for (0313). Called by the door''s own functions.';

revoke all on function public.registration_event_guard(uuid) from public, anon, authenticated;
revoke all on function public.registration_order_guard(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reading: each row rule asks for the event too
-- ---------------------------------------------------------------------------

alter policy registration_events_select on public.registration_events
  using (
    (select public.registration_may_work((select auth.uid())))
    and ((select public.reception_limited_events((select auth.uid()))) is null
         or id = any ((select public.reception_limited_events((select auth.uid())))::uuid[]))
  );

alter policy registration_event_dates_select on public.registration_event_dates
  using (
    (select public.registration_may_work((select auth.uid())))
    and ((select public.reception_limited_events((select auth.uid()))) is null
         or event_id = any ((select public.reception_limited_events((select auth.uid())))::uuid[]))
  );

alter policy registration_event_agenda_select on public.registration_event_agenda
  using (
    (select public.registration_may_work((select auth.uid())))
    and ((select public.reception_limited_events((select auth.uid()))) is null
         or event_id = any ((select public.reception_limited_events((select auth.uid())))::uuid[]))
  );

alter policy registration_ticket_types_select on public.registration_ticket_types
  using (
    (select public.registration_may_work((select auth.uid())))
    and ((select public.reception_limited_events((select auth.uid()))) is null
         or event_id = any ((select public.reception_limited_events((select auth.uid())))::uuid[]))
  );

alter policy registration_orders_select on public.registration_orders
  using (
    (select public.registration_may_work((select auth.uid())))
    and ((select public.reception_limited_events((select auth.uid()))) is null
         or event_id = any ((select public.reception_limited_events((select auth.uid())))::uuid[]))
  );

-- A ticket has no event of its own: it is open when its registration is, and
-- the registration is read under the rule above.
alter policy registration_order_tickets_select on public.registration_order_tickets
  using (
    (select public.registration_may_work((select auth.uid())))
    and ((select public.reception_limited_events((select auth.uid()))) is null
         or exists (select 1 from public.registration_orders o where o.id = registration_order_tickets.order_id))
  );

-- The office reads every code; the door's "Sort out problems" (0312) reads its own events'.
alter policy registration_promo_codes_select on public.registration_promo_codes
  using (
    ((select public.registration_can((select auth.uid()), 'office'))
     or (select public.registration_can((select auth.uid()), 'fix')))
    and ((select public.reception_limited_events((select auth.uid()))) is null
         or event_id = any ((select public.reception_limited_events((select auth.uid())))::uuid[]))
  );

-- Receipts are the office's to check and Reception shows none of them: not open
-- to somebody limited at all. Guarded like 0247's: a database without Storage
-- has no storage.objects to put a policy on.
do $policies$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists registration_proofs_select on storage.objects;
    create policy registration_proofs_select on storage.objects
      for select to authenticated
      using (bucket_id = 'registration-proofs'
             and public.registration_may_work(auth.uid())
             and public.reception_limited_events(auth.uid()) is null);
  end if;
end $policies$;

-- ---------------------------------------------------------------------------
-- 4. Doing: the door's six functions, as they stood, with one line added
-- ---------------------------------------------------------------------------

create or replace function public.registration_order_mark(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
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
  -- Reception for some events only (0313): not a registration of an event that is not theirs.
  perform public.registration_order_guard(p_id);
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

create or replace function public.registration_order_note(p_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if not public.registration_can(auth.uid(), 'note') then
    raise exception 'Notes are for whoever runs registrations, or sorts out problems at Reception.' using errcode = '42501';
  end if;
  -- Reception for some events only (0313): not a registration of an event that is not theirs.
  perform public.registration_order_guard(p_id);
  update public.registration_orders set notes = nullif(left(btrim(coalesce(p_notes, '')), 2000), '') where id = p_id;
end;
$function$;

create or replace function public.registration_order_apply_promo(p_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if not public.registration_can(auth.uid(), 'promo') then
    raise exception 'Putting a promo code on a registration is not one of your rights here.' using errcode = '42501';
  end if;
  -- Reception for some events only (0313): not a registration of an event that is not theirs.
  perform public.registration_order_guard(p_id);
  return public.registration_apply_promo(p_id, p_code);
end;
$function$;

create or replace function public.registration_order_set_email(p_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  o public.registration_orders%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.registration_can(auth.uid(), 'email') then
    raise exception 'Correcting an email address is for whoever the church has given it to.' using errcode = '42501';
  end if;
  -- Reception for some events only (0313): not a registration of an event that is not theirs.
  perform public.registration_order_guard(p_id);
  select * into o from public.registration_orders where id = p_id for update;
  if not found then
    raise exception 'That registration is not there any more.' using errcode = 'P0002';
  end if;
  if o.anonymised_at is not null then
    raise exception 'This registration has been anonymised; there is nobody to email.' using errcode = 'P0001';
  end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'That email address does not look right.' using errcode = 'P0001';
  end if;
  if lower(coalesce(o.email, '')) = v_email then
    return false;
  end if;
  perform public.registration_email_replace(p_id, v_email, auth.uid(), false);
  return true;
end;
$function$;

create or replace function public.registration_order_undo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = 'public'
as $function$
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
  -- Reception for some events only (0313): not a registration of an event that is not theirs.
  perform public.registration_order_guard(p_id);
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

create or replace function public.registration_walk_in(p_event uuid, p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  ev public.registration_events%rowtype;
  v_name text := btrim(coalesce(p_order ->> 'name', ''));
  v_email text := nullif(lower(btrim(coalesce(p_order ->> 'email', ''))), '');
  v_phone text := nullif(btrim(coalesce(p_order ->> 'phone', '')), '');
  v_date uuid := nullif(p_order ->> 'date_id', '')::uuid;
  v_paid boolean := coalesce((p_order ->> 'paid')::boolean, false);
  v_here boolean := coalesce((p_order ->> 'checked_in')::boolean, true);
  line jsonb;
  tt public.registration_ticket_types%rowtype;
  qty int;
  unit int;
  names jsonb;
  i int;
  total_qty int := 0;
  subtotal int := 0;
  order_id uuid := gen_random_uuid();
  v_code text;
  seen uuid[] := '{}';
begin
  if not public.registration_can(auth.uid(), 'walk_in') then
    raise exception 'Registering walk-ins is not one of your rights here.' using errcode = '42501';
  end if;
  if v_paid and not public.registration_can(auth.uid(), 'take_payment') then
    raise exception 'Taking payments is not one of your rights here; register them as still to pay.' using errcode = '42501';
  end if;
  if v_here and not public.registration_can(auth.uid(), 'check_in') then
    raise exception 'Checking people in is not one of your rights here.' using errcode = '42501';
  end if;
  -- Reception for some events only (0313): not a walk-in to an event that is not theirs.
  perform public.registration_event_guard(p_event);
  select * into ev from public.registration_events where id = p_event for update;
  if not found or ev.status = 'draft' or ev.cancelled_at is not null then raise exception 'That event is not taking registrations.'; end if;
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'Give their name.'; end if;
  if v_email is not null and (v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254) then
    raise exception 'That email address does not look right.';
  end if;
  if v_phone is not null and length(v_phone) > 40 then raise exception 'That phone number is too long.'; end if;
  if ev.date_mode = 'choose' then
    if v_date is null or not exists (select 1 from public.registration_event_dates d where d.id = v_date and d.event_id = ev.id) then
      raise exception 'Choose which date they are here for.';
    end if;
  else
    v_date := null;
  end if;
  if jsonb_typeof(p_order -> 'lines') <> 'array' or jsonb_array_length(p_order -> 'lines') = 0 then
    raise exception 'Choose at least one ticket.';
  end if;

  perform 1 from public.registration_ticket_types where event_id = ev.id for update;

  insert into public.registration_orders
    (id, code, event_id, date_id, name, email, phone, quantity, payment_status, payment_method, source)
  values
    (order_id, public.registration_new_code(), ev.id, v_date, v_name, v_email, v_phone, 1, 'not_needed', 'reception', 'walk_in')
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
    unit := case tt.kind when 'free' then 0 when 'paid' then tt.price_pence else coalesce((line ->> 'donation_pence')::int, 0) end;
    if unit < 0 or unit > 1000000 then raise exception 'That amount is not right.'; end if;
    names := case when jsonb_typeof(line -> 'attendee_names') = 'array' then line -> 'attendee_names' else '[]'::jsonb end;
    for i in 1..qty loop
      insert into public.registration_order_tickets (order_id, ticket_type_id, attendee_name, unit_price_pence)
      values (order_id, tt.id, nullif(left(btrim(coalesce(names ->> (i - 1), '')), 120), ''), unit);
    end loop;
    perform public.registration_sold_out_notify(ev.id, tt.id, v_date);
    total_qty := total_qty + qty;
    subtotal := subtotal + unit * qty;
  end loop;
  if total_qty = 0 then raise exception 'Choose at least one ticket.'; end if;

  update public.registration_orders
  set quantity = total_qty,
      subtotal_pence = subtotal,
      total_pence = subtotal,
      payment_status = case when subtotal = 0 then 'not_needed' when v_paid then 'received' else 'awaiting' end,
      received_at = case when subtotal > 0 and v_paid then now() end,
      received_by = case when subtotal > 0 and v_paid then auth.uid() end,
      checked_in_at = case when v_here then now() end,
      checked_in_by = case when v_here then auth.uid() end
  where id = order_id;

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Setting the limits, and reading them
-- ---------------------------------------------------------------------------

-- What Settings › Reception draws: each limit, and the events there are to
-- choose from — by name, for somebody who may change the ticks and yet has no
-- registrations right to read the events with.
create or replace function public.reception_event_limits_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (coalesce(public.may(auth.uid(), 'app.permissions'), false) or public.registration_can(auth.uid(), 'office')) then
    raise exception 'Who works Reception is for whoever runs registrations or may change Access & Privileges.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'limits', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', l.user_id, 'department_id', l.department_id, 'event_ids', to_jsonb(l.event_ids)))
      from public.reception_event_limits l
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'status', e.status, 'cancelled', e.cancelled_at is not null,
        'starts_at', d.first_at, 'ends_at', d.last_at
      ) order by d.first_at desc nulls last, e.title)
      from public.registration_events e
      left join lateral (
        select min(x.starts_at) as first_at, max(coalesce(x.ends_at, x.starts_at)) as last_at
        from public.registration_event_dates x where x.event_id = e.id
      ) d on true
    ), '[]'::jsonb)
  );
end
$$;

comment on function public.reception_event_limits_state() is
  'Settings › Reception (0313): each holder''s limit, and the events to choose from. For whoever may change Access & Privileges or runs registrations.';

revoke all on function public.reception_event_limits_state() from public, anon;
grant execute on function public.reception_event_limits_state() to authenticated;

-- p_changes: [{ "person": uuid } or { "team": uuid }, with "events": [uuid, …] to
-- keep them to those, or "events": null for every event again].
create or replace function public.set_reception_event_limits(p_changes jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c jsonb;
  v_person uuid;
  v_team uuid;
  v_events uuid[];
begin
  if not coalesce(public.may(auth.uid(), 'app.permissions'), false) then
    raise exception 'Choosing the events somebody works Reception for is for whoever may change Access & Privileges.' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Send the changes as a list.' using errcode = '22023';
  end if;

  for c in select * from jsonb_array_elements(p_changes) loop
    v_person := nullif(c ->> 'person', '')::uuid;
    v_team := nullif(c ->> 'team', '')::uuid;
    if (v_person is null) = (v_team is null) then
      raise exception 'A limit is for one person or one team.' using errcode = '22023';
    end if;

    if c -> 'events' is null or jsonb_typeof(c -> 'events') = 'null' then
      delete from public.reception_event_limits l
      where l.user_id is not distinct from v_person and l.department_id is not distinct from v_team;
      continue;
    end if;
    if jsonb_typeof(c -> 'events') <> 'array' then
      raise exception 'Send the events as a list, or null for every event.' using errcode = '22023';
    end if;

    -- A limit kept for somebody not on Reception would be waiting for them if they were put back.
    if not exists (
      select 1 from public.permission_grants g
      where g.capability in ('reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_view', 'reg.door_fix')
        and g.user_id is not distinct from v_person and g.department_id is not distinct from v_team
    ) then
      raise exception 'They are not on Reception: add them first.' using errcode = '22023';
    end if;

    select coalesce(array_agg(distinct x.id), '{}') into v_events
    from (select (jsonb_array_elements_text(c -> 'events'))::uuid as id) x;
    if exists (select 1 from unnest(v_events) as u (id) where not exists (select 1 from public.registration_events e where e.id = u.id)) then
      raise exception 'One of those events is not there any more.' using errcode = '22023';
    end if;

    update public.reception_event_limits l
    set event_ids = v_events, updated_at = now(), updated_by = auth.uid()
    where l.user_id is not distinct from v_person and l.department_id is not distinct from v_team;
    if not found then
      insert into public.reception_event_limits (user_id, department_id, event_ids, updated_by)
      values (v_person, v_team, v_events, auth.uid());
    end if;
  end loop;
end
$$;

comment on function public.set_reception_event_limits(jsonb) is
  'Keeps a Reception holder to the events listed, or gives them every event again (events: null). For whoever may change Access & Privileges (0313).';

revoke all on function public.set_reception_event_limits(jsonb) from public, anon;
grant execute on function public.set_reception_event_limits(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. A limit does not outlive what it was about
-- ---------------------------------------------------------------------------

-- Taken off Reception, wherever the tick was taken off: the limit goes too, so
-- it is not waiting for them the next time they are added.
create or replace function public.reception_event_limits_follow_grants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.capability in ('reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_view', 'reg.door_fix') then
    delete from public.reception_event_limits l
    where l.user_id is not distinct from old.user_id and l.department_id is not distinct from old.department_id
      and not exists (
        select 1 from public.permission_grants g
        where g.capability in ('reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_view', 'reg.door_fix')
          and g.user_id is not distinct from old.user_id and g.department_id is not distinct from old.department_id
      );
  end if;
  return null;
end
$$;

revoke all on function public.reception_event_limits_follow_grants() from public, anon, authenticated;

drop trigger if exists reception_event_limits_follow_grants on public.permission_grants;
create trigger reception_event_limits_follow_grants
  after delete on public.permission_grants
  for each row execute function public.reception_event_limits_follow_grants();

-- An event deleted leaves the lists it was on: fewer events for that holder, never more.
create or replace function public.reception_event_limits_forget_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reception_event_limits l
  set event_ids = array_remove(l.event_ids, old.id)
  where old.id = any (l.event_ids);
  return null;
end
$$;

revoke all on function public.reception_event_limits_forget_event() from public, anon, authenticated;

drop trigger if exists reception_event_limits_forget_event on public.registration_events;
create trigger reception_event_limits_forget_event
  after delete on public.registration_events
  for each row execute function public.reception_event_limits_forget_event();
select public.migration_done(313, '0313_reception_for_some_events_only', 'e8e4b30cb17a32972fd0c2a12ff2a63a35f760b0b8c30acbef24e4cfe7a102b6');
