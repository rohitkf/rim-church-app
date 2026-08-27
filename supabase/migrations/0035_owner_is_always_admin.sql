-- ============================================================================
-- Ownership implies Admin
-- ============================================================================
-- is_admin() read only the grants table, so ownership and Admin could drift
-- apart: an owner whose grant row was missing had no Admin rights, and
-- since granting Admin requires being an Admin, a church could reach a
-- state where nobody could grant anything to anybody. Ownership is meant to
-- be the thing that cannot be locked out, so it now carries Admin with it
-- rather than depending on a second row saying so.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid and role_type = 'admin'
  ) or exists (
    select 1 from public.app_owner where user_id = uid
  );
$$;

-- Keep the visible grant in step with it, so the Volunteers page shows the
-- owner as an Admin without having to explain a special case.
insert into public.user_roles (user_id, role_type)
select user_id, 'admin' from public.app_owner
on conflict do nothing;
