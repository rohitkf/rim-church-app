/*
 * 0287 — a message to the organisers, and files that leave with the event
 *
 * Two things the Owner asked for in one breath, because they are one
 * question: what does an event keep, and when does it go.
 *
 * 1. Somebody registering, or holding a ticket, can ask for help.
 *
 *    Until now the only way to reach the church from /register/<slug> or
 *    /ticket/<code> was to know somebody. `registration_messages` holds
 *    what they write — name, email, the message, the order it was sent
 *    from when there is one — and `registration_contact()` is the only way
 *    in: open to anybody, like registering itself, so it is bounded the
 *    same way a public form has to be (lengths, a published event, and a
 *    ceiling on how many one address or one event can send).
 *
 *    The people who run registrations are told in the bell — one unread
 *    line an event, however many messages, because every notification
 *    buzzes a pocket — and read them on the event's own page, where
 *    `registration_message_mark()` puts one away as dealt with, or back.
 *
 *    They live exactly as long as the event: the foreign key deletes them
 *    with it, and the nightly `registration_anonymise()` deletes them when
 *    it blanks the event's names, because a message is its sender's name,
 *    address and words and nothing else.
 *
 * 2. The files leave too.
 *
 *    Deleting an event deleted its rows and left its files: the payment
 *    screenshots in `registration-proofs` and the picture in
 *    `registration-images`. Nothing pointed at them any more and nothing
 *    removed them. Production had two screenshots and six pictures like
 *    that when this was written.
 *
 *    The database cannot remove a file — Supabase refuses a delete from
 *    storage.objects made in SQL (its `protect_delete` trigger), because
 *    the bytes are elsewhere and only the Storage API takes those away. So
 *    this is done in two halves: `registration_orphan_files()` says which
 *    files nothing points at, and the app removes them through the Storage
 *    API — when an event is deleted, and whenever somebody who may opens
 *    the Registrations page. A file is left alone for its first day: a
 *    receipt is uploaded a moment before the order is told about it.
 *
 *    Anonymising now lets go of the receipt as well. A screenshot of a
 *    bank transfer is a name and an account; blanking the name on the
 *    order and keeping the picture kept the thing that mattered.
 */

create table public.registration_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.registration_events (id) on delete cascade,
  -- The registration it was sent from, when it was sent from a ticket.
  order_id uuid references public.registration_orders (id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now(),
  -- Put away as dealt with, and by whom; null is still waiting.
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null
);

comment on table public.registration_messages is
  'What somebody wrote to the organisers from an event''s public page or their ticket (0287). Written only by registration_contact(); deleted with the event, and when the event is anonymised.';

create index registration_messages_event_idx on public.registration_messages (event_id, created_at desc);
create index registration_messages_order_idx on public.registration_messages (order_id) where order_id is not null;

alter table public.registration_messages enable row level security;
revoke all on public.registration_messages from anon, authenticated;
grant select on public.registration_messages to authenticated;

-- Read by the office. No insert, update or delete policy: the two
-- functions below are the only way in, and the event's deletion the only
-- way out.
create policy registration_messages_select on public.registration_messages
  for select to authenticated
  using (public.registration_can((select auth.uid()), 'office'));

/*
 * Send a message. Open to anybody, so everything about it is checked here
 * and nothing is taken on trust: which event, how long, how many.
 */
create or replace function public.registration_contact(
  p_slug text,
  p_name text,
  p_email text,
  p_message text,
  p_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.registration_events%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_order uuid;
  said text;
begin
  select * into ev from public.registration_events where slug = p_slug;
  -- A draft has no public page, so it has nobody to hear from.
  if not found or ev.status = 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if char_length(v_name) not between 1 and 120 then
    return jsonb_build_object('ok', false, 'reason', 'name');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'reason', 'email');
  end if;
  if char_length(v_message) not between 1 and 2000 then
    return jsonb_build_object('ok', false, 'reason', 'message');
  end if;

  -- One at a time for an event: the two counts below are only a ceiling if
  -- two messages cannot both be counted before either is written.
  perform pg_advisory_xact_lock(hashtext('registration_contact'), hashtext(ev.id::text));
  if (select count(*) from public.registration_messages m
       where m.event_id = ev.id and m.email = v_email and m.created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.registration_messages m
          where m.event_id = ev.id and m.created_at > now() - interval '1 day') >= 200 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  -- The order only when the code is this event's: a code is not a way to
  -- hang a message on somebody else's registration.
  if p_code is not null then
    select o.id into v_order from public.registration_orders o where o.code = p_code and o.event_id = ev.id;
  end if;

  insert into public.registration_messages (event_id, order_id, name, email, message)
  values (ev.id, v_order, v_name, v_email, v_message);

  -- One unread line an event. The page shows how many are waiting.
  said := format('%s asked for help with %s.', v_name, ev.title);
  insert into public.notifications (user_id, type, reference_id, body)
  select m, 'registration_message', ev.id, said
  from public.registration_managers() m
  where not exists (
    select 1 from public.notifications n
    where n.user_id = m and n.type = 'registration_message' and n.reference_id = ev.id and not n.read_boolean
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.registration_contact(text, text, text, text, text) from public;
grant execute on function public.registration_contact(text, text, text, text, text) to anon, authenticated;

-- A message sent twice by a retry is one message (0286).
select public.make_repeat_safe('public.registration_contact(text, text, text, text, text)'::regprocedure);

/* Put a message away as dealt with, or back as waiting. */
create or replace function public.registration_message_mark(p_message uuid, p_handled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.registration_can(auth.uid(), 'office') then
    raise exception 'You cannot do that.' using errcode = '42501';
  end if;
  update public.registration_messages
     set handled_at = case when p_handled then coalesce(handled_at, now()) else null end,
         handled_by = case when p_handled then coalesce(handled_by, auth.uid()) else null end
   where id = p_message;
end;
$$;

revoke all on function public.registration_message_mark(uuid, boolean) from public, anon;
grant execute on function public.registration_message_mark(uuid, boolean) to authenticated;

/*
 * The files of the two registration buckets that nothing points at.
 * The app removes them through the Storage API, which is the only thing
 * that can. Answers nothing for somebody who could not remove them.
 */
create or replace function public.registration_orphan_files()
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where (public.registration_can(auth.uid(), 'delete') or public.may(auth.uid(), 'reg.manage'))
     and o.created_at < now() - interval '1 day'
     and (
       (o.bucket_id = 'registration-proofs'
         and not exists (select 1 from public.registration_orders r where r.proof_path = o.name))
       or
       (o.bucket_id = 'registration-images'
         and not exists (select 1 from public.registration_events e where e.image_path = o.name))
     )
   order by o.bucket_id, o.name
   limit 500
$$;

revoke all on function public.registration_orphan_files() from public, anon;
grant execute on function public.registration_orphan_files() to authenticated;

/*
 * Whoever may delete an event may remove its files. Before this the
 * screenshots asked for reg.manage and the pictures for reg.edit, so
 * somebody given only "Cancel & delete" could delete the event and none
 * of what it left. Guarded like 0247's: a database without Storage has no
 * storage.objects to put a policy on.
 */
do $policies$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists registration_proofs_delete on storage.objects;
    create policy registration_proofs_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'registration-proofs'
             and (public.may((select auth.uid()), 'reg.manage') or public.registration_can((select auth.uid()), 'delete')));
    drop policy if exists registration_images_delete on storage.objects;
    create policy registration_images_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'registration-images'
             and (public.registration_can((select auth.uid()), 'edit') or public.registration_can((select auth.uid()), 'delete')));
  end if;
end;
$policies$;

/*
 * Anonymising: as production had it (0283), and now the messages go and
 * the receipt is let go of. The reference typed beside a receipt is as
 * often a name as a number, so it goes with it.
 */
create or replace function public.registration_anonymise()
returns void
language plpgsql
security definer
set search_path = public
as $function$
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
  -- An event anonymised before this let go of nothing; do those once.
  update public.registration_orders o
  set proof_path = null, proof_reference = null
  where o.anonymised_at is not null and (o.proof_path is not null or o.proof_reference is not null);
end;
$function$;
select public.migration_done(287, '0287_a_message_to_the_organisers_and_files_that_leave_with_the_event', '2452bced23bc0b16b855c79e673230068f4b2549c5d4f6d87a9473edc6fc8f6f');
