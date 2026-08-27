-- ============================================================================
-- A post with no team badge is a post made as an Admin
-- ============================================================================
-- The board shows who a post speaks for: a team badge, or "Admin" when it
-- speaks for the church rather than a team. That reading only holds if
-- nobody else can post without a badge, so the insert policy now requires a
-- team unless the author is an Admin.
--
-- Posting rights themselves are unchanged: Admins and Department Heads (the
-- Service Flow team's head included, since that team's head is a department
-- head like any other).
drop policy if exists messages_insert on public.messages;

create policy messages_insert on public.messages
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_admin(auth.uid())
      or (
        department_id is not null
        and exists (
          select 1 from public.user_roles
          where user_id = auth.uid() and role_type = 'department_head'
        )
      )
    )
  );
