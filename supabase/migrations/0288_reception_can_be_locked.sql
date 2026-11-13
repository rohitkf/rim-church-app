/*
 * Reception can be locked.
 *
 * The Owner asked for a way to say when the people given Reception may
 * use it: "just in case someone enters and accidentally presses some
 * buttons and messes things up". A door right (0251: reg.door,
 * reg.door_pay, reg.walk_in, and 0267's reg.door_view) is given once and
 * then holds on every day of the year, though it is wanted for the
 * morning of an event.
 *
 * So Reception has a lock. While it is on, the four door rights give
 * nothing — not the page, not its list, not a check-in, a payment or a
 * walk-in — and they come back, untouched, when it is taken off. Nobody's
 * rights are changed by it: locking is not taking a grant away, and
 * unlocking does not have to remember who had what.
 *
 * Who it does not hold: whoever runs registrations (reg.manage — the
 * Owner always). They are the ones who lock and unlock it, and the
 * event's own page, which is theirs, goes on working. The office rights
 * (view, edit, approve, refund, cancel, verify, email) are not door
 * rights and are not touched.
 *
 * It is the database's, like every other rule here: registration_can()
 * is what every policy and every function about registrations asks, and
 * it is the one place that changes. The app asks reception_lock_state()
 * so that somebody turned away is told why, and not shown an empty page.
 *
 * Compatible with the app in production: nothing is taken away, and the
 * lock starts off.
 */

-- ---------------------------------------------------------------------------
-- The lock: one row
-- ---------------------------------------------------------------------------

create table public.reception_lock (
  id boolean primary key default true,
  locked boolean not null default false,
  -- A line for whoever is turned away: "Opens at 9 on Saturday".
  note text,
  changed_at timestamptz,
  changed_by uuid references public.profiles(id) on delete set null,
  constraint reception_lock_is_one_row check (id),
  constraint reception_lock_note_length check (note is null or length(note) <= 200)
);

comment on table public.reception_lock is
  'Whether Reception is locked: while it is, the door rights give nothing (0288). One row; read through reception_lock_state(), written through set_reception_lock().';

insert into public.reception_lock (id, locked) values (true, false);

-- No policy at all: nothing reads or writes it but the functions below.
alter table public.reception_lock enable row level security;
revoke all on table public.reception_lock from public, anon, authenticated;

create or replace function public.reception_is_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select locked from public.reception_lock where id), false)
$$;

comment on function public.reception_is_locked() is
  'True while Reception is locked: the door rights give nothing until it is unlocked (0288).';

revoke all on function public.reception_is_locked() from public, anon;
grant execute on function public.reception_is_locked() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The one rule everything about registrations asks
-- ---------------------------------------------------------------------------

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
    when 'door' then public.may(uid, 'reg.manage')
                  or (not public.reception_is_locked()
                      and (public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                           or public.may(uid, 'reg.walk_in') or public.may(uid, 'reg.door_view')))
    when 'work' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.view') or public.may(uid, 'reg.edit')
                  or public.may(uid, 'reg.approve') or public.may(uid, 'reg.refund') or public.may(uid, 'reg.cancel')
                  or public.may(uid, 'reg.verify') or public.may(uid, 'reg.email')
                  or (not public.reception_is_locked()
                      and (public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                           or public.may(uid, 'reg.walk_in') or public.may(uid, 'reg.door_view')))
    when 'edit' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.edit')
    when 'approve' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
    when 'take_payment' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.approve')
                          or (not public.reception_is_locked() and public.may(uid, 'reg.door_pay'))
    when 'refund' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.refund')
    when 'cancel' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.cancel')
    when 'delete' then exists (select 1 from public.app_owner where user_id = uid) or public.may(uid, 'reg.cancel')
    when 'check_in' then public.may(uid, 'reg.manage')
                      or (not public.reception_is_locked()
                          and (public.may(uid, 'reg.door') or public.may(uid, 'reg.door_pay')
                               or public.may(uid, 'reg.walk_in')))
    when 'walk_in' then public.may(uid, 'reg.manage')
                     or (not public.reception_is_locked() and public.may(uid, 'reg.walk_in'))
    when 'verify' then public.may(uid, 'reg.verify')
    when 'email' then public.may(uid, 'reg.manage') or public.may(uid, 'reg.email')
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- Asking, and turning the key
-- ---------------------------------------------------------------------------

create or replace function public.reception_lock_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'locked', l.locked,
    'note', l.note,
    'changed_at', l.changed_at,
    'changed_by', nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
    'can_lock', coalesce(public.may(auth.uid(), 'reg.manage'), false)
  )
  from public.reception_lock l
  left join public.profiles p on p.id = l.changed_by
  where l.id
$$;

comment on function public.reception_lock_state() is
  'Whether Reception is locked, the line left for whoever is turned away, who turned the key and when, and whether the caller may turn it (0288).';

revoke all on function public.reception_lock_state() from public, anon;
grant execute on function public.reception_lock_state() to authenticated;

create or replace function public.set_reception_lock(p_locked boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not coalesce(public.may(auth.uid(), 'reg.manage'), false) then
    raise exception 'Locking Reception is for whoever runs registrations.' using errcode = '42501';
  end if;
  if p_locked is null then
    raise exception 'Say whether Reception is locked or not.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 200 then
    raise exception 'The note is too long: 200 characters at most.' using errcode = '22023';
  end if;

  update public.reception_lock
     set locked = p_locked,
         -- The note is what a locked door says; an open one says nothing.
         note = case when p_locked then v_note end,
         changed_at = now(),
         changed_by = auth.uid()
   where id;

  return public.reception_lock_state();
end;
$$;

comment on function public.set_reception_lock(boolean, text) is
  'Locks or unlocks Reception, for whoever runs registrations (reg.manage; the Owner always) (0288).';

revoke all on function public.set_reception_lock(boolean, text) from public, anon;
grant execute on function public.set_reception_lock(boolean, text) to authenticated;
select public.migration_done(288, '0288_reception_can_be_locked', '9af4ca88c85b50e169514b09a7543c4ccba636a96e2d5d9bd8113ca0d0cc4dc7');
