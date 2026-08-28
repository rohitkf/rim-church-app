-- ============================================================================
-- Push subscriptions
-- ============================================================================
-- A notification row is only useful to someone who has the app open. To
-- reach a phone in a pocket on a Saturday night, the browser's push service
-- needs an endpoint and two keys per device, and the server needs somewhere
-- to keep them.
--
-- One row per *device*, not per person: a volunteer with a phone and a
-- laptop should get told on both, and revoking one must not silence the
-- other. The endpoint is the browser's own identifier for the subscription
-- and is unique, so re-subscribing on a device already known updates that
-- row instead of growing a second one.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  -- Stamped when the push service rejects the endpoint, so a dead
  -- subscription is cleaned up rather than retried forever.
  failed_at timestamptz
);

alter table public.push_subscriptions enable row level security;

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- A subscription is a device fingerprint: only its owner may see it, and
-- only its owner may create or remove one. Nobody — Admins included — has a
-- reason to read another person's endpoints from the client, and the sender
-- runs with the service role, which bypasses these policies anyway.
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (user_id = auth.uid());
