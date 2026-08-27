-- ============================================================================
-- Handbooks: Word documents too, 30MB, and heads only
-- ============================================================================
-- Three things move together here.
--
-- 1. A handbook may now be a Word document as well as a PDF, so the object
--    path can end .pdf or .docx. The bucket gains both as its only allowed
--    types and a 30MB ceiling, so an oversized or wrong-typed upload is
--    refused by storage itself rather than only by the browser.
--
-- 2. Uploading, replacing and removing is the Department Head's, not the
--    Assisting Head's. Migration 0018 widened is_dept_head() to cover
--    assisting heads — which is right for verifying checklists, and wrong
--    here — so these policies ask for the head grant directly.
--
-- 3. Reading is unchanged: anyone who can see the team's content can open
--    or download its handbook.
update storage.buckets
set allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    file_size_limit = 30 * 1024 * 1024
where id = 'handbooks';

create or replace function public.is_strict_dept_head(uid uuid, dept_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = uid and role_type = 'department_head' and department_id = dept_id
  );
$$;

drop policy if exists handbooks_insert on storage.objects;
drop policy if exists handbooks_update on storage.objects;
drop policy if exists handbooks_delete on storage.objects;

create policy handbooks_insert on storage.objects
  for insert with check (
    bucket_id = 'handbooks'
    and (
      public.is_admin(auth.uid())
      or public.is_strict_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

create policy handbooks_update on storage.objects
  for update using (
    bucket_id = 'handbooks'
    and (
      public.is_admin(auth.uid())
      or public.is_strict_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );

create policy handbooks_delete on storage.objects
  for delete using (
    bucket_id = 'handbooks'
    and (
      public.is_admin(auth.uid())
      or public.is_strict_dept_head(auth.uid(), (storage.foldername(name))[1]::uuid)
    )
  );
