-- ============================================================================
-- A device belongs to whoever is signed in on it
-- ============================================================================
--
-- Registering a browser for push was a plain upsert on `endpoint`, which
-- works right up until the same browser is used by a second account — a
-- shared laptop in the church office, a head who keeps a test login, a
-- phone handed to a spouse.
--
-- The endpoint is the browser's identifier for its subscription, so it is
-- the same string whoever is signed in. The upsert therefore lands on a row
-- owned by the previous account, and the UPDATE policy's `user_id =
-- auth.uid()` is read against that row's *existing* owner — so it fails.
-- The second person's device silently never registers, and they get no
-- notifications with nothing on screen to explain why.
--
-- Loosening the policy is the wrong repair: `using (true)` would let any
-- signed-in account overwrite a subscription row belonging to anyone else.
-- What is actually wanted is narrower than a policy can say — a device may
-- always claim itself for the person currently signed in on it, and may do
-- nothing else. So it is a function, and the client no longer writes to the
-- table directly.
--
-- Claiming is the correct outcome, not a compromise: the browser can only
-- hold one push subscription, so the previous owner's phone would never
-- have received anything through it again anyway.

create or replace function public.register_push_device(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_endpoint), '') = ''
     or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth), '') = ''
  then
    raise exception 'A push subscription needs an endpoint and both keys.'
      using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = uid,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        -- A device that has just registered is by definition reachable
        -- again, whatever the push service said about it last week.
        failed_at = null;
end;
$$;

revoke all on function public.register_push_device(text, text, text) from public;
grant execute on function public.register_push_device(text, text, text) to authenticated;
