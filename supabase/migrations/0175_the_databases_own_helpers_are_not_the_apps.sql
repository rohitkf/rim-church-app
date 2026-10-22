-- Helpers the app never calls are not callable, part three (0151, 0169).
--
-- 0169 closed the identity and membership helpers to anon. It could not
-- close them to signed-in accounts, because a row-level policy runs as the
-- role that made the request, and a policy that says `is_admin(auth.uid())`
-- needs `authenticated` to hold EXECUTE on is_admin. Postgres has no grant
-- that reads "callable from a policy but not by name", and a SECURITY
-- DEFINER body cannot tell the two apart either: current_user is the owner
-- in both cases. So every signed-in account could still ask the Data API
-- `POST /rpc/is_dept_member` about any profile and any team, or
-- `/rpc/is_admin` about any profile, and learn what department_members and
-- user_roles would have refused to show them. The audit's verifiers found
-- that door still open after 0169, low in severity, and real.
--
-- The one place that can tell an RPC from a policy is the request itself.
-- PostgREST sets `request.path` for every request before it runs
-- `pgrst.db_pre_request`, which is already ours (reject_removed_user, 0070),
-- and an RPC's path is `/rpc/<function>`. So the hook now refuses a request
-- whose path names one of these helpers, for every role but service_role —
-- the edge functions and the scheduled jobs, which call what they like with
-- the service key. Policies are untouched: they never pass through a path.
-- The app is untouched: it calls none of these by name (its rpc() list is
-- the 55 user-facing functions, and the only definer readers among them are
-- next_asset_tag, married_couples, my_profile, people_contacts,
-- person_by_email and poll_tallies, which stay open).
--
-- Fail-safe by construction: with `request.path` unset (a bare Postgres, a
-- future PostgREST that renames it) the check does nothing and the hook is
-- exactly what 0070 made it. And the refusal carries its own detail,
-- `not_an_rpc`, so the client's account-removed handling (which looks for
-- `account_removed`) does not mistake it for a removed account.

create or replace function public.reject_removed_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  claims json;
  uid uuid;
  called text;
  -- The database's own helpers: policy predicates, resolvers and the grid.
  -- None of them is an API the app uses; every one answers about whatever
  -- uuid it is handed.
  helpers constant text[] := array[
    'is_admin', 'is_super_admin', 'is_dept_member', 'is_dept_head',
    'is_dept_head_or_assisting', 'is_any_department_head', 'is_on_a_team',
    'is_a_lead', 'has_dept_role', 'can_view_department_content',
    'is_any_coordinator', 'is_rota_coordinator', 'is_service_flow_signer',
    'is_service_coordinator', 'in_household', 'may', 'permission_reach',
    'can_open_page', 'page_level', 'stage_may', 'may_see_poll_voters',
    'poll_department', 'poll_is_open', 'session_service',
    'rota_assignment_user', 'rota_assignment_department',
    'rota_assignment_service', 'checklist_department', 'checklist_service',
    'stage_layout_service', 'service_has_finished', 'availability_is_closed'
  ];
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

  -- The database's own helpers are not the app's. Everyone but the service
  -- role is refused when the request names one of them by path; a policy
  -- that calls the same function never comes this way.
  if coalesce(claims ->> 'role', '') <> 'service_role' then
    called := substring(coalesce(current_setting('request.path', true), '')
                        from '(?:^|/)rpc/([A-Za-z0-9_]+)/?$');
    if called is not null and called = any (helpers) then
      raise insufficient_privilege
        using message = 'That function is the database''s own, not the app''s.',
              detail = 'not_an_rpc';
    end if;
  end if;

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

-- PostgREST runs the hook as the role of the request — it has already
-- switched to anon, authenticated or service_role when it calls this — so
-- those three must be able to execute it, or every request fails before it
-- starts. Said explicitly here rather than left to the default grant.
revoke all on function public.reject_removed_user() from public;
grant execute on function public.reject_removed_user() to anon, authenticated, service_role;

-- PostgREST reads the hook's definition fresh on every request, so nothing
-- to reload; the row on `authenticator` from 0070 still names it.
