/*
 * A check-in for each day (found on the second morning of the Pastors' &
 * Leaders Conference, 21 November 2026, when the Owner asked whether an
 * event of several days can be checked in on each of them).
 *
 * It could, at the door: Reception counts only today's check-ins as here
 * and offers yesterday's a check-in again (0254). But a registration has
 * one checked_in_at, so checking somebody in on the second day wrote over
 * the first. By the end of a two-day event the database knew who came on
 * the last day each person came, and nothing of the days before.
 *
 * So each check-in is also kept by the day it was on:
 * registration_check_ins, one row per registration per day (the church's
 * day, by its time zone). A trigger on registration_orders writes it, so
 * every way of checking in is covered — the scanner, Find, a walk-in,
 * "Paid & check in" — and nothing that checks in had to change.
 *
 *   checked in                     that day's row is written
 *   checked in again, a later day  that day's row is written; the earlier stays
 *   check-in undone, or cancelled  that day's row is removed
 *   Undo puts an earlier check-in  the later day's row is removed, the
 *   back (0281)                    earlier day's is as it was
 *
 * registration_orders.checked_in_at is unchanged and still means "the
 * latest check-in": Reception and the event's page read it as before.
 *
 * The trigger can never stop a check-in: whatever goes wrong in it is a
 * warning in the log, and the door carries on.
 *
 * Read by whoever may read the registration itself, events they are kept
 * to included (0313); written by nobody but the trigger.
 */

create table public.registration_check_ins (
  order_id uuid not null references public.registration_orders (id) on delete cascade,
  on_date date not null,
  checked_in_at timestamptz not null,
  checked_in_by uuid references public.profiles (id) on delete set null,
  primary key (order_id, on_date)
);

create index registration_check_ins_by_idx on public.registration_check_ins (checked_in_by);
create index registration_check_ins_date_idx on public.registration_check_ins (on_date);

comment on table public.registration_check_ins is
  'A check-in for each day (0314): one row per registration per church day it was checked in on. Written by a trigger on registration_orders; registration_orders.checked_in_at stays the latest check-in.';

alter table public.registration_check_ins enable row level security;
revoke all on table public.registration_check_ins from public, anon, authenticated;
grant select on table public.registration_check_ins to authenticated;

-- Open when its registration is: that is read under registration_orders' own
-- rule, which asks for the right and, for somebody kept to some events, the event.
create policy registration_check_ins_select on public.registration_check_ins
  for select to authenticated
  using (
    (select public.registration_may_work((select auth.uid())))
    and exists (select 1 from public.registration_orders o where o.id = registration_check_ins.order_id)
  );

create or replace function public.registration_orders_keep_check_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
begin
  begin
    tz := public.church_timezone();
    -- Taken back: undone, cancelled, or put back to an earlier check-in. That day's row goes.
    if tg_op = 'UPDATE' and old.checked_in_at is not null
       and (new.checked_in_at is null or new.checked_in_at < old.checked_in_at) then
      delete from public.registration_check_ins c
      where c.order_id = new.id and c.on_date = (old.checked_in_at at time zone tz)::date;
    end if;
    -- Checked in, or the time or the person of it changed: that day's row is as the registration says.
    if new.checked_in_at is not null
       and (tg_op = 'INSERT' or old.checked_in_at is distinct from new.checked_in_at
            or old.checked_in_by is distinct from new.checked_in_by) then
      insert into public.registration_check_ins as c (order_id, on_date, checked_in_at, checked_in_by)
      values (new.id, (new.checked_in_at at time zone tz)::date, new.checked_in_at, new.checked_in_by)
      on conflict (order_id, on_date) do update
        set checked_in_at = excluded.checked_in_at, checked_in_by = excluded.checked_in_by;
    end if;
  exception when others then
    -- Never the door's problem: the check-in itself has happened.
    raise warning 'registration_check_ins was not kept for %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end
$$;

revoke all on function public.registration_orders_keep_check_ins() from public, anon, authenticated;

drop trigger if exists registration_orders_keep_check_ins on public.registration_orders;
create trigger registration_orders_keep_check_ins
  after insert or update of checked_in_at, checked_in_by on public.registration_orders
  for each row execute function public.registration_orders_keep_check_ins();

-- What is known today: each registration's latest check-in, on the day it was.
insert into public.registration_check_ins (order_id, on_date, checked_in_at, checked_in_by)
select o.id, (o.checked_in_at at time zone public.church_timezone())::date, o.checked_in_at, o.checked_in_by
from public.registration_orders o
where o.checked_in_at is not null
on conflict (order_id, on_date) do nothing;
select public.migration_done(314, '0314_a_check_in_for_each_day', '310e54f8b0a22bc50cd432df654f03942754d3e5831973002ecb1eedcfe60f3a');
