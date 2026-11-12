/*
 * An email that bounced says so.
 *
 * A registration's ticket is its page, and the email only carries the
 * link — but the email is how most people get back to the page. One typed
 * with a slip (jerryjohn4chrost@… for …christ@…, November 2026) bounced,
 * nobody knew, and the attendee was left waiting for a ticket that had
 * nowhere to go. The Owner asked for three things: to see, for each
 * registration, whether its email arrived or bounced; for the attendee to
 * be told when it bounced and asked for the right address; and for the
 * church to be able to put the right address in, which sends the email
 * again.
 *
 * What is known about an email
 * ----------------------------
 * The registration-email function gives every email it sends a reference
 * of its own (a tag Resend carries), writes it on the order *before* it
 * sends — so nothing Resend says about the email can arrive ahead of it —
 * and Resend tells the registration-email-status function what became of
 * it: delivered, delayed, bounced, held back because the address bounced
 * before (suppressed), marked as spam (complained), or never sent
 * (failed). registration_email_event() writes that on every order the
 * email was for, and only ever forwards: a late "sent" does not undo a
 * "delivered", and a bounce is the last word.
 *
 * An order keeps the story of its *latest* email, for the address it now
 * holds. Emails from before this migration have no reference and no
 * story; their status is simply not known (null).
 *
 * Putting an address right
 * ------------------------
 *   the church     registration_order_set_email(order, address): a right
 *                  of its own, reg.email ("Correct an email address"),
 *                  which "Run registrations" includes. Admins have it out
 *                  of the box; it opens the Registrations page, because
 *                  nobody can correct a list they cannot see. The change
 *                  is one more thing Undo puts back (0281) — the address
 *                  and what was known about it — and the app holds the
 *                  email for the ten seconds Undo is offered.
 *   the attendee   registration_order_fix_email(code, address), from the
 *                  ticket page, and only once the email to the address on
 *                  the order has bounced: with the link and a bounce, the
 *                  address is theirs to correct; without a bounce it is
 *                  not, or anybody holding a link could redirect a ticket.
 *                  Three times at most.
 *
 * Either way the order remembers the address it had (email_before), who
 * changed it and when, and its email_sent_at is cleared, so the ticket
 * goes to the new address at once instead of waiting out the ten quiet
 * minutes.
 *
 * The retention job blanks all of it with the address: a bounce message
 * quotes the address it bounced from.
 */

-- ---------------------------------------------------------------------------
-- What an order knows about its email
-- ---------------------------------------------------------------------------

alter table public.registration_orders
  add column if not exists email_ref uuid,
  add column if not exists email_status text,
  add column if not exists email_status_at timestamptz,
  add column if not exists email_status_detail text,
  add column if not exists email_changed_at timestamptz,
  add column if not exists email_changed_by uuid references public.profiles (id) on delete set null,
  add column if not exists email_before jsonb,
  add column if not exists email_fixes smallint not null default 0;

alter table public.registration_orders
  add constraint registration_orders_email_status_check
    check (email_status is null or email_status in ('sent', 'delayed', 'delivered', 'complained', 'bounced', 'suppressed', 'failed')),
  add constraint registration_orders_email_status_detail_check
    check (email_status_detail is null or length(email_status_detail) <= 500);

comment on column public.registration_orders.email_ref is
  'The reference the registration-email function gave the latest email to this order (a Resend tag). What Resend says about that email is matched on it.';
comment on column public.registration_orders.email_status is
  'What became of the latest email, to the address the order now holds: sent, delayed, delivered, complained, bounced, suppressed, failed. Null: none sent, or sent before 0283.';
comment on column public.registration_orders.email_before is
  'The address this order held before the last change to it, and what was known about that one. Undo puts it back.';
comment on column public.registration_orders.email_fixes is
  'How many times the attendee has corrected a bounced address from the ticket page. Three at most.';

-- Resend's word is matched on the reference; who changed an address is a person.
create index if not exists registration_orders_email_ref_idx
  on public.registration_orders (email_ref) where email_ref is not null;
create index if not exists registration_orders_email_changed_by_idx
  on public.registration_orders (email_changed_by) where email_changed_by is not null;

-- ---------------------------------------------------------------------------
-- The right to correct an address
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('reg.email', 'admin', '{none,all}', 'all'),
  ('reg.email', 'head', '{none,all}', 'none'),
  ('reg.email', 'assistant', '{none,all}', 'none'),
  ('reg.email', 'coordinator', '{none,all}', 'none'),
  ('reg.email', 'member', '{none,all}', 'none'),
  ('reg.email', 'newcomer', '{none,all}', 'none'),
  ('reg.email', 'overwatch', '{none,all}', 'none'),
  ('reg.email', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- Every check still goes through here (0251, 0267). 'email' is the new
-- one; it opens the Registrations page and reads the rows, like the other
-- office rights, and "Run registrations" includes it.
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
    when 'door' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                  or public.may(uid, 'reg.walk_in') or public.may(uid, 'reg.door_view')
    when 'work' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                  or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
                  or public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay') or public.may(uid, 'reg.walk_in')
                  or public.may(uid, 'reg.verify') or public.may(uid, 'reg.door_view') or public.may(uid, 'reg.email')
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
    when 'email' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.email')
    else false
  end
$$;
revoke all on function public.registration_can(uuid, text) from public, anon;
grant execute on function public.registration_can(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- What became of an email
-- ---------------------------------------------------------------------------

-- Did not arrive, and the address is why: the two the attendee is told about.
-- "failed" is not one of them — a quota or a setting, not their typing.
create or replace function public.registration_email_bounced(p_status text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_status in ('bounced', 'suppressed'), false)
$$;
revoke all on function public.registration_email_bounced(text) from public, anon, authenticated;

-- How far along a status is. Resend's events can arrive out of order; an
-- order only ever moves forward. A bounce is the last word.
create or replace function public.registration_email_rank(p_status text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_status
    when 'sent' then 1
    when 'delayed' then 2
    when 'delivered' then 3
    when 'complained' then 4
    when 'bounced' then 5
    when 'suppressed' then 5
    when 'failed' then 5
    else 0
  end
$$;
revoke all on function public.registration_email_rank(text) from public, anon, authenticated;

-- About to send: the orders the email is for take its reference, before
-- Resend is asked, so its first word about the email finds them.
create or replace function public.registration_email_begin(p_orders uuid[], p_ref uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.registration_orders
     set email_ref = p_ref, email_status = 'sent', email_status_at = now(), email_status_detail = null
   where id = any (p_orders);
$$;
revoke all on function public.registration_email_begin(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.registration_email_begin(uuid[], uuid) to service_role;

-- Resend took it (stamp when), or refused it there and then (say why).
create or replace function public.registration_email_end(p_ref uuid, p_error text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_error is null then
    update public.registration_orders set email_sent_at = now() where email_ref = p_ref;
  else
    update public.registration_orders
       set email_status = 'failed', email_status_at = now(),
           email_status_detail = nullif(left(btrim(p_error), 500), '')
     where email_ref = p_ref and email_status = 'sent';
  end if;
end;
$$;
revoke all on function public.registration_email_end(uuid, text) from public, anon, authenticated;
grant execute on function public.registration_email_end(uuid, text) to service_role;

-- Resend's word about an email, from registration-email-status. Answers
-- how many orders it moved: none when the order has had a later email or
-- a new address since, or already knows as much.
create or replace function public.registration_email_event(p_ref uuid, p_status text, p_at timestamptz, p_detail text)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  if public.registration_email_rank(p_status) = 0 then
    raise exception 'Not a status an email has: %', p_status;
  end if;
  update public.registration_orders o
     set email_status = p_status,
         email_status_at = coalesce(p_at, now()),
         email_status_detail = nullif(left(btrim(coalesce(p_detail, '')), 500), '')
   where o.email_ref = p_ref
     and public.registration_email_rank(p_status) > public.registration_email_rank(o.email_status);
  get diagnostics moved = row_count;
  return moved;
end;
$$;
revoke all on function public.registration_email_event(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.registration_email_event(uuid, text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------------
-- Putting an address right
-- ---------------------------------------------------------------------------

-- The address is part of what Undo puts back (0281).
create or replace function public.registration_order_state(o public.registration_orders)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select jsonb_build_object(
    'status', o.status,
    'cancelled_at', o.cancelled_at,
    'payment_status', o.payment_status,
    'payment_method', o.payment_method,
    'received_at', o.received_at,
    'received_by', o.received_by,
    'checked_in_at', o.checked_in_at,
    'checked_in_by', o.checked_in_by,
    'refund_status', o.refund_status,
    'refund_at', o.refund_at,
    'refund_by', o.refund_by,
    'payment_verified_at', o.payment_verified_at,
    'payment_verified_by', o.payment_verified_by,
    'notes', o.notes,
    'email', o.email
  );
$$;
revoke all on function public.registration_order_state(public.registration_orders) from public, anon, authenticated;

-- A memory made a moment ago knows nothing of the address; it has not moved.
update public.registration_order_undos u
   set was = case when u.was = '{}'::jsonb then u.was else u.was || jsonb_build_object('email', o.email) end,
       became = u.became || jsonb_build_object('email', o.email)
  from public.registration_orders o
 where o.id = u.order_id;

-- The one way an address changes: the old one and what was known about it
-- kept in email_before, everything about the new one blank, and the quiet
-- ten minutes over. Not granted to anybody; the two functions below call it.
create or replace function public.registration_email_replace(p_id uuid, p_email text, p_by uuid, p_fix boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.registration_orders o
     set email_before = jsonb_build_object(
           'email', o.email,
           'email_sent_at', o.email_sent_at,
           'email_ref', o.email_ref,
           'email_status', o.email_status,
           'email_status_at', o.email_status_at,
           'email_status_detail', o.email_status_detail,
           'email_changed_at', o.email_changed_at,
           'email_changed_by', o.email_changed_by,
           'was', o.email_before ->> 'email'
         ),
         email = p_email,
         email_sent_at = null,
         email_ref = null,
         email_status = null,
         email_status_at = null,
         email_status_detail = null,
         email_changed_at = now(),
         email_changed_by = p_by,
         email_fixes = o.email_fixes + case when p_fix then 1 else 0 end
   where o.id = p_id;
end;
$$;
revoke all on function public.registration_email_replace(uuid, text, uuid, boolean) from public, anon, authenticated;

-- The church puts an address right. Answers whether it changed: the same
-- address again changes nothing (the app then just sends the email again).
create or replace function public.registration_order_set_email(p_id uuid, p_email text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.registration_can(auth.uid(), 'email') then
    raise exception 'Correcting an email address is for whoever the church has given it to.' using errcode = '42501';
  end if;
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
$$;
revoke all on function public.registration_order_set_email(uuid, text) from public, anon;
grant execute on function public.registration_order_set_email(uuid, text) to authenticated;

-- The attendee puts their own address right, from the ticket page — only
-- once the email to the one on the order has bounced, and three times at most.
create or replace function public.registration_order_fix_email(p_code text, p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  select * into o from public.registration_orders where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    raise exception 'No such ticket.' using errcode = 'P0002';
  end if;
  if o.status <> 'confirmed' or o.anonymised_at is not null then
    raise exception 'This registration is cancelled.' using errcode = 'P0001';
  end if;
  if not public.registration_email_bounced(o.email_status) then
    raise exception 'The email to this address has not come back, so it cannot be changed here. If it is wrong, please contact the church.' using errcode = 'P0001';
  end if;
  if o.email_fixes >= 3 then
    raise exception 'This address has been changed several times already. Please contact the church.' using errcode = 'P0001';
  end if;
  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'That email address does not look right.' using errcode = 'P0001';
  end if;
  if lower(coalesce(o.email, '')) = v_email then
    raise exception 'That is the address the email could not be delivered to. Check it for a slip.' using errcode = 'P0001';
  end if;
  perform public.registration_email_replace(o.id, v_email, null, true);
end;
$$;
revoke all on function public.registration_order_fix_email(text, text) from public;
grant execute on function public.registration_order_fix_email(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Undo: the address is one more thing put back
-- ---------------------------------------------------------------------------

-- As on production, with the address named in what was done.
create or replace function public.registration_orders_remember()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  was jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else public.registration_order_state(old) end;
  became jsonb := public.registration_order_state(new);
  word text;
begin
  -- The undo itself is not something to undo.
  if coalesce(current_setting('rim.registration_undoing', true), '') = '1' then
    return null;
  end if;
  -- Nothing a press changes moved: an email stamped, what Resend said of it.
  if tg_op = 'UPDATE' and was = became then
    return null;
  end if;
  if tg_op = 'INSERT' then
    -- Only an order made at the door by one of us. One made by the attendee is not ours to undo.
    if me is null or new.source is distinct from 'walk_in' then
      return null;
    end if;
  elsif me is null or not public.registration_may_work(me) then
    delete from public.registration_order_undos u where u.order_id = new.id;
    return null;
  end if;

  word := case
    when tg_op = 'INSERT' then 'registered'
    when (was ->> 'status') is distinct from (became ->> 'status') then
      case when became ->> 'status' = 'cancelled' then 'cancelled' else 'put back' end
    when (was ->> 'refund_status') is distinct from (became ->> 'refund_status') then 'refund'
    when (was ->> 'payment_status') is distinct from (became ->> 'payment_status') then 'payment'
    when (was ->> 'checked_in_at') is distinct from (became ->> 'checked_in_at') then 'check-in'
    when (was ->> 'payment_verified_at') is distinct from (became ->> 'payment_verified_at') then 'verification'
    when (was ->> 'notes') is distinct from (became ->> 'notes') then 'note'
    when (was ->> 'email') is distinct from (became ->> 'email') then 'email address'
    else 'change'
  end;

  insert into public.registration_order_undos as u (order_id, done_by, done_at, what, was, became)
  values (new.id, me, now(), word, was, became)
  on conflict (order_id) do update set
    -- The same person in the same transaction: one thing done, in steps.
    -- Keep where it started and what it was called; move where it ended.
    was = case when u.done_by = excluded.done_by and u.done_at = excluded.done_at then u.was else excluded.was end,
    what = case when u.done_by = excluded.done_by and u.done_at = excluded.done_at then u.what else excluded.what end,
    refund_details = case when u.done_by = excluded.done_by and u.done_at = excluded.done_at then u.refund_details end,
    became = excluded.became,
    done_by = excluded.done_by,
    done_at = excluded.done_at;
  return null;
end;
$$;
revoke all on function public.registration_orders_remember() from public, anon, authenticated;

-- As on production, and an address put back comes with what was known
-- about it: when it was emailed, what became of that email, who had
-- changed it before.
create or replace function public.registration_order_undo(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  o public.registration_orders%rowtype;
  u public.registration_order_undos%rowtype;
  ev public.registration_events%rowtype;
  tt public.registration_ticket_types%rowtype;
  line record;
  address_back boolean;
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
  if public.registration_order_state(o) is distinct from u.became then
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
$$;
revoke all on function public.registration_order_undo(uuid) from public, anon;
grant execute on function public.registration_order_undo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- What the ticket page is told
-- ---------------------------------------------------------------------------

-- As on production, with two more answers: email_state — none, waiting,
-- delivered, bounced — and email_can_fix, whether this page may correct it.
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
$$;
revoke all on function public.registration_order_view(text) from public;
grant execute on function public.registration_order_view(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention: the address goes, and everything said about it
-- ---------------------------------------------------------------------------

-- As on production, with the email's story blanked beside the address: a
-- bounce message quotes the address, and email_before is the one before.
create or replace function public.registration_anonymise()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_days integer := (select registration_retention_days from public.app_settings limit 1);
begin
  if keep_days is null then return; end if;
  create temp table if not exists _reg_done (event_id uuid primary key) on commit drop;
  insert into _reg_done
  select e.id from public.registration_events e
  where (select max(coalesce(d.ends_at, d.starts_at)) from public.registration_event_dates d where d.event_id = e.id)
        < now() - make_interval(days => keep_days);
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
      anonymised_at = now()
  where o.anonymised_at is null and o.event_id in (select event_id from _reg_done);
end;
$$;
revoke all on function public.registration_anonymise() from public, anon, authenticated;
