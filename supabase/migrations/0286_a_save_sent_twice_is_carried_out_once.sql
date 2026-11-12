/*
 * A save sent twice is carried out once.
 *
 * Where the database has a natural key a repeat is harmless: one clock-in
 * a person a day, one vote a poll. But a registration, an alert to the
 * whole church, an issue, a prayer request have none, and on a slow
 * connection the answer to the first tap can be lost — the phone gives up
 * after a minute, the database has already done it, and a second tap does
 * it again: two registrations holding two places, every pocket buzzed
 * twice (the system-design review, November 2026). A button that greys
 * out while it waits covers the double tap; nothing covered the answer
 * that never came.
 *
 * For rows the app inserts itself, nothing here is needed: the app now
 * chooses the new row's id before it sends, and sends the same id again
 * when it never heard back, so the repeat is a duplicate key and is read
 * as "already saved" (frontend/src/lib/saveOnce.ts).
 *
 * This is the other half: the functions that create things.
 *
 *   request_keys          a request the app marked with a key, the function
 *                         it was for, who asked, and what was answered.
 *                         Kept an hour: a retry comes within minutes.
 *   make_repeat_safe()    gives a function a second form that takes the
 *                         key first — `fn(p_request_key, …the same arguments)`
 *                         — and nothing else changes: the function itself
 *                         is untouched and is still called without a key
 *                         by every app already open. With a key, the
 *                         first call does the work and keeps its answer;
 *                         the same key again is answered with that answer
 *                         and does nothing. A second call that arrives
 *                         while the first is still running waits for it.
 *
 * A key is the caller's: the same key from somebody else, or for another
 * function, is refused rather than answered. And a call that failed keeps
 * nothing — its transaction, the key with it, is rolled back — so trying
 * again after a refusal is an ordinary try.
 */

create table public.request_keys (
  id uuid primary key,
  fn text not null,
  -- Who asked; nobody for a visitor. Not a reference: it is kept an hour.
  user_id uuid,
  -- What the function answered, to be answered again.
  result jsonb,
  at timestamptz not null default now()
);

comment on table public.request_keys is
  'Requests the app marked with a key, and what was answered, so the same request sent twice is carried out once (0286). Kept an hour.';

create index request_keys_at_idx on public.request_keys (at);

-- Read and written only by the three functions below, from inside the
-- repeat-safe form of a function.
alter table public.request_keys enable row level security;
revoke all on public.request_keys from anon, authenticated;

/*
 * Has this request been carried out already? Claims the key when it has
 * not. Waits, when another call with the same key is still running, to
 * see whether it finishes: if it does this is a repeat, and if it fails
 * the key is free again.
 */
create or replace function public.request_repeated(p_request uuid, p_fn text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_request is null then
    return false;
  end if;
  insert into public.request_keys (id, fn, user_id)
  values (p_request, p_fn, auth.uid())
  on conflict (id) do nothing;
  if found then
    return false;
  end if;
  if exists (
    select 1 from public.request_keys k
     where k.id = p_request and k.fn = p_fn and k.user_id is not distinct from auth.uid()
  ) then
    return true;
  end if;
  -- Somebody else's key, or one used for something else: not answered.
  raise exception 'That request key is already in use.' using errcode = '22023';
end;
$$;

create or replace function public.request_result(p_request uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select k.result from public.request_keys k where k.id = p_request and k.user_id is not distinct from auth.uid()
$$;

create or replace function public.request_keep(p_request uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.request_keys set result = p_result where id = p_request
$$;

create or replace function public.delete_old_request_keys()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.request_keys where at < now() - interval '1 hour'
$$;

/*
 * Give a function its repeat-safe form: the same name, with the request's
 * key as its first argument and every other argument as it was, defaults
 * and all. The key comes first because it has no default — so a call
 * without one can only ever mean the function itself, and the API never
 * has two candidates to choose between. It is called `p_request_key`, not
 * `p_request`: six functions already take a `p_request`, and mean the
 * request somebody made (a stage move, a family link), not this.
 *
 * It answers what the function answers. It runs as the function's owner,
 * as the functions it is made for do (they find the caller through
 * auth.uid(), which this does not change), and it is open to exactly who
 * the function is open to.
 */
create or replace function public.make_repeat_safe(p_fn regprocedure)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  call_args text;
  body text;
  safe text;
begin
  select p.oid, p.proname, p.pronargs, p.prosecdef, p.proretset,
         pg_get_function_arguments(p.oid) as args,
         pg_get_function_identity_arguments(p.oid) as identity_args,
         pg_get_function_result(p.oid) as returns
    into f
    from pg_proc p
   where p.oid = p_fn;

  if f.proretset then
    raise exception '% returns a set; a repeat-safe form keeps one answer', p_fn;
  end if;
  if not f.prosecdef then
    raise exception '% runs as its caller; called from here it would run as its owner and pass every rule', p_fn;
  end if;
  if f.args ~ '(^|, )(OUT|INOUT|VARIADIC) ' then
    raise exception '% has an argument this cannot pass on', p_fn;
  end if;
  if f.args ~ '(^|, )p_request_key ' then
    raise exception '% already takes a request key', p_fn;
  end if;

  select coalesce(string_agg('$' || (i + 1), ', ' order by i), '') into call_args from generate_series(1, f.pronargs) as i;

  if f.returns = 'void' then
    body := format(
      $f$begin
  if public.request_repeated($1, %1$L) then
    return;
  end if;
  perform public.%1$I(%2$s);
  perform public.request_keep($1, null);
end;$f$, f.proname, call_args);
  elsif f.returns = 'jsonb' then
    body := format(
      $f$declare
  answer jsonb;
begin
  if public.request_repeated($1, %1$L) then
    return public.request_result($1);
  end if;
  answer := public.%1$I(%2$s);
  perform public.request_keep($1, answer);
  return answer;
end;$f$, f.proname, call_args);
  else
    body := format(
      $f$declare
  answer %3$s;
begin
  if public.request_repeated($1, %1$L) then
    return (public.request_result($1) #>> '{}')::%3$s;
  end if;
  answer := public.%1$I(%2$s);
  perform public.request_keep($1, to_jsonb(answer));
  return answer;
end;$f$, f.proname, call_args, f.returns);
  end if;

  execute format(
    'create or replace function public.%I(p_request_key uuid%s) returns %s language plpgsql security definer set search_path = public as %L',
    f.proname,
    case when f.args = '' then '' else ', ' || f.args end,
    f.returns,
    body
  );

  safe := format('public.%I(uuid%s)', f.proname, case when f.identity_args = '' then '' else ', ' || f.identity_args end);
  execute format('comment on function %s is %L', safe,
    format('%s, carried out once for one request key: the same key again is answered with the first answer (0286).', f.proname));
  execute format('revoke all on function %s from public, anon, authenticated', safe);
  if has_function_privilege('authenticated', f.oid, 'execute') then
    execute format('grant execute on function %s to authenticated', safe);
  end if;
  if has_function_privilege('anon', f.oid, 'execute') then
    execute format('grant execute on function %s to anon', safe);
  end if;
end;
$$;

comment on function public.make_repeat_safe(regprocedure) is
  'Give a function a form that takes a request key first and is carried out once for it (0286). For a function that creates something with no natural key; list it in frontend/src/lib/saveOnce.ts too.';

-- None of these is for a browser: the repeat-safe forms call them as their owner.
revoke all on function public.request_repeated(uuid, text) from public, anon, authenticated;
revoke all on function public.request_result(uuid) from public, anon, authenticated;
revoke all on function public.request_keep(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.delete_old_request_keys() from public, anon, authenticated;
revoke all on function public.make_repeat_safe(regprocedure) from public, anon, authenticated;

/*
 * The functions that create something with no natural key. Each name is
 * every form it has today (post_church_update has two). The app's list,
 * SAVE_ONCE_FUNCTIONS in frontend/src/lib/saveOnce.ts, is held to this
 * one by a test.
 */
do $safe$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as fn
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = any (array[
         'registration_register',
         'registration_walk_in',
         'send_announcement',
         'alert_team',
         'post_church_update',
         'raise_issue',
         'submit_feedback',
         'prayer_ask',
         'prayer_add_update',
         'create_service_series',
         'add_guest_to_team',
         'push_onboarding',
         'prompt_setup',
         'prompt_location'
       ])
       -- Not a form this has already made, if it is run again.
       and (p.proargnames is null or p.proargnames[1] is distinct from 'p_request_key')
     order by p.proname, p.oid
  loop
    perform public.make_repeat_safe(f.fn);
  end loop;
end;
$safe$;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'delete-old-request-keys';
    perform cron.schedule('delete-old-request-keys', '47 * * * *', 'select public.delete_old_request_keys()');
  end if;
end;
$cron$;

select public.migration_done(286, '0286_a_save_sent_twice_is_carried_out_once', '18a902b61508dac12bdb948544f53bcce6b7700c11f54522fab33f9aaa564055');
