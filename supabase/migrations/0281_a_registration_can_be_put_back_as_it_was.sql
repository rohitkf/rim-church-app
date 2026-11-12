/*
 * A registration can be put back as it was.
 *
 * The Owner asked for a way to undo on the registration pages, "in case
 * we press any option by accident" (November 2026). Some presses already
 * had an opposite in the menu — Undo check-in, Put back, Back to awaiting
 * payment — and some did not: a refund marked done could not be unmarked,
 * and its bank details were deleted with the press; "Paid now + check in"
 * took two presses to take back; a walk-in registered by a slip stayed.
 * And an opposite is not an undo. "Back to awaiting payment" after a slip
 * on a payment the attendee had reported leaves it awaiting, not reported,
 * with the receipt they sent no longer waiting to be checked.
 *
 * So the database remembers. Whenever somebody who works registrations
 * changes an order, the order's state from before the change is kept
 * beside it — one memory an order, the latest — and
 * registration_order_undo() puts exactly that back: the payment as it
 * stood, the check-in, the cancellation, the refund and the bank details
 * that went with it, the note. A walk-in undone is the walk-in gone.
 *
 * It is a narrow thing on purpose:
 *
 *   whose      only whoever did it. Somebody else's press is theirs to
 *              undo; anybody else puts it right from the menu, knowingly.
 *   how long   ten minutes. After that it is not a slip any more.
 *   if moved   never over somebody else's change. If the order is not as
 *              the press left it — the attendee paid meanwhile, a
 *              colleague checked them in — the undo is refused and says so.
 *   one step   what happened in one transaction is one thing to undo, so
 *              "Paid now + check in" comes back in one press
 *              (registration_order_pay_and_check_in does both in one).
 *
 * The memory holds a note and, for a refund, the bank details that were
 * deleted — which were deleted on purpose (0250). So it does not keep
 * them: a job clears every memory older than the ten minutes, and the row
 * goes with its order.
 *
 * What it does not undo: an event cancelled (that is for good, 0250, and
 * asks for the event's name typed first), and an email already sent. The
 * app holds the "your ticket is confirmed" and "we could not find your
 * payment" emails back for the seconds the Undo is on offer, so a slip
 * does not write to the attendee; that is the app's half (lib/registrationUndo).
 */

-- ---------------------------------------------------------------------------
-- What of an order a press can change
-- ---------------------------------------------------------------------------

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
    'notes', o.notes
  );
$$;

revoke all on function public.registration_order_state(public.registration_orders) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The memory
-- ---------------------------------------------------------------------------

create table public.registration_order_undos (
  -- One an order: the last thing done to it.
  order_id uuid primary key references public.registration_orders(id) on delete cascade,
  done_by uuid not null references public.profiles(id) on delete cascade,
  done_at timestamptz not null default now(),
  -- A word for what was done, for whoever reads the table.
  what text not null,
  -- The order as it was, and as the press left it. Empty `was`: the order did not exist.
  was jsonb not null,
  became jsonb not null,
  -- The bank details a refund deleted, to put back with it.
  refund_details jsonb
);

comment on table public.registration_order_undos is
  'The state of a registration before the last thing somebody did to it, for ten minutes, so a slip can be undone exactly (0281). Written by triggers, read by registration_order_undo() alone.';

create index registration_order_undos_done_by_idx on public.registration_order_undos (done_by);
create index registration_order_undos_done_at_idx on public.registration_order_undos (done_at);

-- Nobody reads or writes it but the triggers and the function: it holds a
-- note and, briefly, somebody's bank details.
alter table public.registration_order_undos enable row level security;
revoke all on public.registration_order_undos from anon, authenticated;

/*
 * Remember an order as it was, when somebody who works registrations
 * changes it. A change by anybody else — the attendee reporting a
 * payment, a job — is not remembered, and whatever memory there was no
 * longer matches the order, so it goes.
 *
 * After the row, not before: another trigger may still change what is
 * written (a payment sent back loses its verification, 0267), and what
 * must be remembered is the order as it ended up.
 */
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
  -- Nothing a press changes moved: an email stamped, a name blanked by the retention job.
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

create trigger registration_orders_remember
  after insert or update on public.registration_orders
  for each row execute function public.registration_orders_remember();

/*
 * Marking a refund done deletes the bank details it was sent to (0250).
 * They are remembered with the press that deleted them, for as long as
 * the press can be undone and not a minute longer.
 */
create or replace function public.registration_refund_details_remember()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('rim.registration_undoing', true), '') <> '1' then
    update public.registration_order_undos u
       set refund_details = to_jsonb(old)
     where u.order_id = old.order_id and u.done_by = auth.uid() and u.done_at = now();
  end if;
  return old;
end;
$$;

revoke all on function public.registration_refund_details_remember() from public, anon, authenticated;

create trigger registration_refund_details_remember
  before delete on public.registration_refund_details
  for each row execute function public.registration_refund_details_remember();

-- ---------------------------------------------------------------------------
-- Undo
-- ---------------------------------------------------------------------------

/*
 * 0250's guard, as production has it, with one way through: a walk-in
 * marked paid by the same slip that made it is undone by deleting it, and
 * no money came in to be refunded.
 */
create or replace function public.registration_orders_keep_unrefunded()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(current_setting('rim.registration_undoing', true), '') = '1' then
    return old;
  end if;
  if public.registration_money_in(old) and coalesce(old.refund_status, '') <> 'refunded' then
    raise exception 'Some people on this event have paid and are not refunded yet. Cancel the event, refund them, then delete it.';
  end if;
  return old;
end;
$function$;

/*
 * Put a registration back as it was before the last thing done to it.
 * Returns the word for what was undone. Refuses, in words the page can
 * show, when there is nothing to undo, when it was somebody else's, when
 * it was too long ago, or when the order has changed since.
 */
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
           notes = b.notes
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

/*
 * Reception took the money and let them in: two marks, one press — and
 * one transaction, so one thing to undo. Each mark checks its own right,
 * as it does alone.
 */
create or replace function public.registration_order_pay_and_check_in(p_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform public.registration_order_mark(p_id, 'received');
  perform public.registration_order_mark(p_id, 'check_in');
end;
$$;

revoke all on function public.registration_order_pay_and_check_in(uuid) from public, anon;
grant execute on function public.registration_order_pay_and_check_in(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A memory lasts ten minutes
-- ---------------------------------------------------------------------------

create or replace function public.registration_undos_expire()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.registration_order_undos where done_at < now() - interval '10 minutes';
$$;

revoke all on function public.registration_undos_expire() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'registration-undos-expire';
    perform cron.schedule('registration-undos-expire', '*/5 * * * *', 'select public.registration_undos_expire()');
  end if;
end;
$cron$;
