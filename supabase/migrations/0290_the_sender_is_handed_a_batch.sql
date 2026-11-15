/*
 * 0290 — The sender is handed a batch
 *
 * Every row written to `notifications` used to make its own call to
 * push-notify, and each call asked the database three things. Forty call
 * times written in one second (14 November 2026, 20:00) were forty calls
 * landing on a function that had been idle for two hours: each took seven
 * to fourteen seconds, the database stopped listening at five, and App
 * Health filled with forty-one "Timeout of 5000 ms reached" for pushes
 * that had in fact gone out.
 *
 * This is the first of two migrations, with a deploy of push-notify in
 * between, and only adds:
 *
 *   push_batch(ids)            everything the sender needs for a list of
 *                              notifications, in one answer: each row
 *                              and the devices it goes to, with whoever
 *                              has turned that kind off, and whoever is
 *                              blocked, already left out.
 *   push_note_failures(detail) the sender's own word that a phone's push
 *                              service refused it. Until now nothing could
 *                              see that (0284 says so): push-notify
 *                              answers 200 whatever its devices said.
 *
 * Nothing here changes how a push is sent. The function now on production
 * does not know either of these and is not disturbed by them; the next
 * one asks push_batch for every call, the old one-row webhook's included.
 * 0291 then replaces the webhook with one call per transaction.
 */

-- ---------------------------------------------------------------------------
-- A failure the platform did not record has no id of the platform's
-- ---------------------------------------------------------------------------

-- source_id is the platform's id for a run or an answer, there so the
-- hourly copy never writes one twice. What the sender reports itself has
-- none; two nulls are not equal, so health_events_once lets them be.
alter table public.health_events alter column source_id drop not null;

-- ---------------------------------------------------------------------------
-- What the sender needs for a list of notifications
-- ---------------------------------------------------------------------------

/*
 * One element per notification that should buzz at least one phone:
 * { id, user_id, type, body, reference_id, devices: [{ id, endpoint,
 * p256dh, auth }] }, oldest first, so that where one kind replaces the
 * last on a lock screen the newest is what stays.
 *
 * Left out, each for the reason push-notify used to work out a row at a
 * time: a notification that is no longer there (the board keeps one unread
 * line, the newest), a person with no live device, a board post or team
 * chat line for somebody who has turned that kind off (push_preferences,
 * 0185 — every other kind always pushes), and a blocked account (0279).
 *
 * jsonb, not rows: the API cuts a set of rows off at its row limit, and a
 * push that silently went to the first thousand devices is the kind of
 * failure nobody finds.
 */
create or replace function public.push_batch(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', n.id,
        'user_id', n.user_id,
        'type', n.type,
        'body', n.body,
        'reference_id', n.reference_id,
        'devices', d.devices
      )
      order by n.created_at, n.id
    ),
    '[]'::jsonb
  )
  from public.notifications n
  cross join lateral (
    select jsonb_agg(
             jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
             order by s.created_at, s.id
           ) as devices
      from public.push_subscriptions s
     where s.user_id = n.user_id
       and s.failed_at is null
  ) d
  left join public.push_preferences pp on pp.user_id = n.user_id
  where n.id = any (p_ids)
    and d.devices is not null
    and not (n.type = 'message' and pp.board is false)
    and not (n.type = 'team_chat' and pp.team_chat is false)
    and public.account_is_blocked(n.user_id) is not true
$$;

comment on function public.push_batch(uuid[]) is
  'For push-notify: the notifications in a list that should reach a phone, each with its devices; muted kinds and blocked accounts left out (0290).';

-- It hands out the keys to people's devices: the sender's alone.
revoke all on function public.push_batch(uuid[]) from public, anon, authenticated;
grant execute on function public.push_batch(uuid[]) to service_role;

-- ---------------------------------------------------------------------------
-- The sender says when a phone's push service refused it
-- ---------------------------------------------------------------------------

/*
 * One line in App Health per call that had a refusal in it, in the
 * sender's words ("2 of 41 devices could not be reached: 403 ×2").
 *
 * A subscription the browser threw away (404, 410) is not a failure and
 * is not reported: the sender deletes it, as it always has.
 *
 * Twenty an hour at most. Wrong signing keys refuse every device on every
 * call, and the twentieth line says nothing the first did not.
 */
create or replace function public.push_note_failures(p_detail text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  said text := left(btrim(coalesce(p_detail, '')), 500);
begin
  if said = '' then return false; end if;
  if (select count(*) from public.health_events
       where kind = 'push' and source_id is null and at > now() - interval '1 hour') >= 20 then
    return false;
  end if;
  insert into public.health_events (kind, name, at, detail) values ('push', 'push-notify', now(), said);
  return true;
end;
$$;

comment on function public.push_note_failures(text) is
  'For push-notify: record in App Health that phones'' push services refused a batch; answers whether it was kept (0290).';

revoke all on function public.push_note_failures(text) from public, anon, authenticated;
grant execute on function public.push_note_failures(text) to service_role;
select public.migration_done(290, '0290_the_sender_is_handed_a_batch', 'df297c909eb6184a5a374347465e9c0bfdb537ac56c02a4af74cea86beda2418');
