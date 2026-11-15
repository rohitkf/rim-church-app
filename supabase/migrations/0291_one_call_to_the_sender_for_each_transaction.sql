/*
 * 0291 — One call to the sender for each transaction
 *
 * APPLY ONLY AFTER push-notify HAS BEEN DEPLOYED FROM THIS RELEASE. The
 * function before it does not know what `{ "ids": [...] }` is, answers
 * 200 "ignored", and no phone buzzes again — with nothing anywhere to say
 * so. The order is 0290, the deploy, then this.
 *
 * Until now a webhook made in the dashboard ("push-on-notification")
 * called push-notify once for every row written to `notifications`. Two
 * things were wrong with that.
 *
 * It was one call a person. A reminder to forty people was forty calls in
 * the same instant, each waking its own copy of the function (0290 has
 * the evening that showed it). Six kinds of notification do this — call
 * times, availability and clock-in reminders, the setup and location
 * prompts, a church update — and the list grows with every new kind.
 *
 * And it was in no migration. The webhook, and the service key pasted
 * into its definition, existed only on production: a database rebuilt
 * from this repository would have sent nothing and said nothing.
 *
 * Now:
 *
 *   - every statement that writes notifications adds their ids to a list
 *     kept for the length of the transaction (a setting, `rim.push_ids`);
 *   - when the transaction commits, the list goes to push-notify in one
 *     call — a hundred ids to a call, so a very large mailing is a few;
 *   - where to call and with what key are two secrets in Vault,
 *     `push_notify_url` and `push_notify_key`. On production this
 *     migration takes both from the webhook it replaces. On a new
 *     database somebody has to give them:
 *
 *       select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-notify', 'push_notify_url');
 *       select vault.create_secret('<the service-role key>', 'push_notify_key');
 *
 *     and until they do, App Health says push is not set up, once an hour
 *     at most, each time a notification had nowhere to go.
 *
 * A push that cannot be queued never undoes what was saved: the bell has
 * the line either way, and the failure goes to App Health.
 *
 * The sender is given thirty seconds, not five. It answers when it has
 * finished, so its answer is the truth about the batch; a hundred people's
 * phones take a second or two warm and several from cold.
 */

-- ---------------------------------------------------------------------------
-- Where to call, and with what: out of the webhook and into Vault
-- ---------------------------------------------------------------------------

do $$
declare
  hook text;
  target text;
  key text;
  have_url boolean;
  have_key boolean;
begin
  select pg_get_triggerdef(t.oid) into hook
    from pg_trigger t
   where t.tgrelid = 'public.notifications'::regclass
     and t.tgname = 'push-on-notification'
     and not t.tgisinternal;

  if to_regclass('vault.secrets') is null then
    if hook is not null then
      raise exception 'The push webhook is here but Vault is not: its address and key would be lost. Enable Vault (supabase_vault) and run this again.';
    end if;
    return; -- CI, or a bare Postgres: nothing calls out from here anyway.
  end if;

  execute $q$ select exists (select 1 from vault.secrets where name = 'push_notify_url'),
                     exists (select 1 from vault.secrets where name = 'push_notify_key') $q$
    into have_url, have_key;

  if hook is null then return; end if; -- A new database: the header says what to run.

  target := (regexp_match(hook, $r$http_request\('(https://[^']+)'$r$))[1];
  key := (regexp_match(hook, $r$"Authorization"\s*:\s*"Bearer ([^"]+)"$r$))[1];

  if (not have_url and target is null) or (not have_key and key is null) then
    raise exception 'Could not read the address or the key out of the push webhook; nothing was changed. Put them in Vault by hand (see this file''s header) and run this again.';
  end if;

  if not have_url then
    execute $q$ select vault.create_secret($1, 'push_notify_url', 'Where the database sends notifications to be pushed to phones (0291).') $q$ using target;
  end if;
  if not have_key then
    execute $q$ select vault.create_secret($1, 'push_notify_key', 'The service-role key the database shows push-notify (0291).') $q$ using key;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hand a list of notifications to the sender
-- ---------------------------------------------------------------------------

/*
 * Answers how many calls it queued. pg_net makes them after the
 * transaction commits, so a rolled-back save sends nothing.
 *
 * Every schema it reaches into is Supabase's (net, vault,
 * supabase_functions), so each is asked for first and reached in dynamic
 * SQL, as health_collect() does: CI's database has none of them and
 * queues nothing.
 *
 * Each call is written into supabase_functions.hooks under the webhook's
 * old name, which is how health_collect() tells a failed push from any
 * other failed call.
 */
create or replace function public.push_send(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer := coalesce(cardinality(p_ids), 0);
  first integer := 1;
  calls integer := 0;
  target text;
  key text;
  request bigint;
  names_hooks boolean := to_regclass('supabase_functions.hooks') is not null;
begin
  if total = 0 then return 0; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then return 0; end if;

  if to_regclass('vault.decrypted_secrets') is not null then
    execute $q$
      select (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_url'),
             (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_key')
    $q$ into target, key;
  end if;
  if coalesce(target, '') = '' or coalesce(key, '') = '' then
    perform public.push_note_failures(
      'Push is not set up on this database: Vault has no push_notify_url or no push_notify_key (migration 0291 says what to run). Notifications reach the bell and no phone.');
    return 0;
  end if;

  while first <= total loop
    execute $q$ select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 30000) $q$
      into request
      using target,
            jsonb_build_object('ids', to_jsonb(p_ids[first : first + 99])),
            jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key);
    if names_hooks then
      execute $q$ insert into supabase_functions.hooks (hook_table_id, hook_name, request_id) values ($1, 'push-on-notification', $2) $q$
        using 'public.notifications'::regclass::oid::integer, request;
    end if;
    first := first + 100;
    calls := calls + 1;
  end loop;

  return calls;
end;
$$;

comment on function public.push_send(uuid[]) is
  'Queue calls to push-notify for a list of notifications, a hundred to a call; answers how many calls (0291). The address and key are Vault''s push_notify_url and push_notify_key.';

revoke all on function public.push_send(uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Collect while the transaction runs, send once when it commits
-- ---------------------------------------------------------------------------

/*
 * After each statement: add what it wrote to the transaction's list.
 *
 * No `set search_path` on this one, on purpose. It names nothing outside
 * pg_catalog, and a function with a SET clause of its own is one more
 * thing between a transaction-local setting and the end of the
 * transaction.
 */
create or replace function public.notifications_collect_for_push()
returns trigger
language plpgsql
as $$
declare
  fresh text;
begin
  select string_agg(r.id::text, ',') into fresh from new_rows r;
  if fresh is null then return null; end if;
  perform set_config(
    'rim.push_ids',
    concat_ws(',', nullif(current_setting('rim.push_ids', true), ''), fresh),
    true
  );
  return null;
end;
$$;

/*
 * At commit: the first row's turn takes the whole list and empties it;
 * every other row's turn finds nothing and returns. Rows written during
 * commit itself (by another deferred trigger) start a new list and have
 * turns of their own still to come, so they are sent too.
 *
 * The list is emptied outside the block that can fail: an error rolls
 * back to the start of its block, and a list put back would be tried
 * again on every remaining row's turn.
 */
create or replace function public.notifications_send_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  waiting text := nullif(current_setting('rim.push_ids', true), '');
begin
  if waiting is null then return null; end if;
  perform set_config('rim.push_ids', '', true);
  begin
    perform public.push_send(string_to_array(waiting, ',')::uuid[]);
  exception when others then
    begin
      perform public.push_note_failures('The database could not hand notifications to the sender: ' || sqlerrm);
    exception when others then
      null; -- Nothing left to tell it with. What was saved still stands.
    end;
  end;
  return null;
end;
$$;

revoke all on function public.notifications_collect_for_push() from public, anon, authenticated;
revoke all on function public.notifications_send_push() from public, anon, authenticated;

drop trigger if exists notifications_collect_for_push on public.notifications;
create trigger notifications_collect_for_push
  after insert on public.notifications
  referencing new table as new_rows
  for each statement execute function public.notifications_collect_for_push();

drop trigger if exists notifications_send_push on public.notifications;
create constraint trigger notifications_send_push
  after insert on public.notifications
  deferrable initially deferred
  for each row execute function public.notifications_send_push();

-- The webhook this replaces. Its address and key are in Vault by now, or
-- the block at the top stopped the migration before it got here.
drop trigger if exists "push-on-notification" on public.notifications;
select public.migration_done(291, '0291_one_call_to_the_sender_for_each_transaction', 'f36c41edb917da656599c3c9b7d9d663778c7eceb25a2f295419554d7a8e5ff8');
