-- ============================================================================
-- Storage: department handbook PDFs (FR12.7)
-- ============================================================================
-- Convention: object path is `${department_id}/handbook.pdf`, so the
-- department a file belongs to is recovered from the path itself via
-- storage.foldername(), the same way Supabase's own storage RLS examples
-- do it — no separate "which department owns this file" table needed.
insert into storage.buckets (id, name, public)
values ('handbooks', 'handbooks', false)
on conflict (id) do nothing;

create policy handbooks_select on storage.objects
  for select using (
    bucket_id = 'handbooks'
    and public.can_view_department_content(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

-- FR12.7: Admin or the department's Head may upload/replace the handbook.
-- Assisting Heads are view-only (Open Question 1 decision), so excluded.
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

-- ============================================================================
-- Storage: profile pictures (Section 7 architecture note)
-- ============================================================================
-- Convention: object path is `${user_id}/avatar.<ext>`. Avatars are as
-- broadly visible as the rest of profiles (FR-level: any signed-in user, see
-- profiles_select_authenticated) since they're shown alongside names on
-- rosters, checklists, and the message board.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

create policy avatars_select on storage.objects
  for select using (bucket_id = 'avatars' and auth.uid() is not null);

create policy avatars_insert on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (
      public.is_admin(auth.uid())
      or (storage.foldername(name))[1]::uuid = auth.uid()
    )
  );

create policy avatars_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (
      public.is_admin(auth.uid())
      or (storage.foldername(name))[1]::uuid = auth.uid()
    )
  );

create policy avatars_delete on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (
      public.is_admin(auth.uid())
      or (storage.foldername(name))[1]::uuid = auth.uid()
    )
  );
