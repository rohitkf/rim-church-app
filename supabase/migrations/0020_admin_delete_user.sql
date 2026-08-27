-- ============================================================================
-- Admin: remove a person entirely
-- ============================================================================
-- Deleting the auth user is what actually removes someone: their profile,
-- team memberships, role grants, availability answers, rota assignments,
-- messages and notifications all hang off it by cascade. The browser
-- client has no rights over auth.users, so this runs as the function
-- owner with the Admin check inside — the check is the only thing
-- standing between a caller and the delete, so it comes first.
create function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can remove someone from the app';
  end if;

  -- Removing yourself would leave you signed in with no account, and
  -- could strand the church with no Admin at all.
  if target_user_id = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

-- Only signed-in callers may even attempt it. The `authenticated` role is
-- Supabase's; a bare Postgres (used to dry-run these migrations in CI)
-- has no such role, so the grant is guarded rather than assumed.
revoke all on function public.admin_delete_user(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.admin_delete_user(uuid) to authenticated;
  end if;
end $$;
