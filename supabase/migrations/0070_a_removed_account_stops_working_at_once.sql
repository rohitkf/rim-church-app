-- ============================================================================
-- A removed account stops working at once, not in an hour
-- ============================================================================
--
-- Removing somebody deletes their auth user, and everything they own goes
-- with it by cascade — profile, memberships, roles, rota, messages. Their
-- sessions and refresh tokens go too. What does not go is the access token
-- already sitting in their browser: it is a signed JWT, checked against its
-- own signature and expiry and nothing else, so no delete can reach it. It
-- keeps working until it expires.
--
-- The obvious fix does not exist. `auth.admin.signOut()` revokes sessions
-- for a *JWT* — the user's own access token — which an Admin has no way to
-- obtain. There is no admin call that invalidates a token by user id.
--
-- And the window is not harmless. Measured against this database, a token
-- whose user row is gone could still read the whole roster, every team,
-- every service and the inventory: those policies ask whether the caller is
-- signed in, and as far as Postgres is concerned they still are.
--
-- So the check happens where every Data API request already passes:
-- PostgREST's pre-request hook. One indexed lookup, and a caller whose
-- profile no longer exists is refused before their query runs.
--
-- Scope, stated plainly rather than left to be discovered: this covers the
-- Data API. Realtime and Storage do not run it, so a removed person's token
-- could still open a Realtime socket until it expires. What they would see
-- through it is bounded by the same RLS policies, which no longer find them
-- anywhere — and the far larger surface, every table read in the app, is
-- closed here.

create or replace function public.reject_removed_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  claims json;
  uid uuid;
begin
  -- No claims at all: an unauthenticated request. The sign-in page is one
  -- of those, so this must pass.
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  exception when others then
    -- Unparseable claims are not this function's business, and refusing
    -- everything on a surprise here would take the app down. RLS remains
    -- the real gate; let it decide.
    return;
  end;
  if claims is null then return; end if;

  -- Only ordinary signed-in people are checked. `service_role` is the
  -- edge functions and the scheduled jobs, which have no profile and are
  -- not supposed to; `anon` has no identity to remove.
  if coalesce(claims ->> 'role', '') <> 'authenticated' then return; end if;

  uid := auth.uid();
  if uid is null then return; end if;

  if not exists (select 1 from public.profiles where id = uid) then
    raise insufficient_privilege
      using message = 'Your account is no longer active.',
            detail = 'account_removed';
  end if;
end;
$$;

revoke all on function public.reject_removed_user() from public;

-- The hook itself. Guarded because a bare Postgres — which CI uses to dry
-- run these migrations — has no `authenticator` role to configure.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.reject_removed_user''';
    -- PostgREST reads its config once at boot; this makes it read again.
    notify pgrst, 'reload config';
  end if;
end $$;

-- To take it off again, if it ever misbehaves:
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
