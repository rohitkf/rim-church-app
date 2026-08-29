-- ============================================================================
-- An Assisting Head is a deputy everywhere, not almost everywhere
-- ============================================================================
--
-- 0018 widened is_dept_head() to cover assisting_head so that every policy
-- gating on it picked the change up at once. Two places were written
-- against the narrower rule instead and so never did:
--
--   1. The handbook bucket, which gates on is_strict_dept_head() — an
--      Assisting Head could read their team's handbook but not replace it.
--   2. The rota release-request notification, which reads user_roles
--      directly and so only ever reached the Department Head.
--
-- Both move onto is_dept_head(), and is_strict_dept_head() goes with them:
-- a second, narrower definition of "head" sitting unused is how the two
-- drifted apart in the first place.

-- 1. The handbook is the team's, so whoever leads the team keeps it.
drop policy if exists handbooks_insert on storage.objects;
drop policy if exists handbooks_update on storage.objects;
drop policy if exists handbooks_delete on storage.objects;

create policy handbooks_insert on storage.objects
  for insert with check (
    bucket_id = 'handbooks'
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

create policy handbooks_update on storage.objects
  for update using (
    bucket_id = 'handbooks'
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

create policy handbooks_delete on storage.objects
  for delete using (
    bucket_id = 'handbooks'
    and (
      public.is_admin(auth.uid())
      or public.is_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

-- 2. A release request has to reach someone who can decide it. Both roles
--    can, so both are told — otherwise a team whose Head is away has a
--    deputy who is allowed to answer but never hears the question.
create or replace function public.notify_on_rota_release_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  holding_department uuid;
begin
  select department_id into holding_department
    from public.rota_assignments where id = new.assignment_id;

  insert into public.notifications (user_id, type, reference_id)
  select r.user_id, 'rota_release_request', new.id
    from public.user_roles r
   where r.department_id = holding_department
     and r.role_type in ('department_head', 'assisting_head')
     and r.user_id <> new.requested_by;

  return new;
end;
$$;

-- 3. Nothing gates on the narrow rule any more, and nothing should.
drop function if exists public.is_strict_dept_head(uuid, uuid);
