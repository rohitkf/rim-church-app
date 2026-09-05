-- ============================================================================
-- A team can see who leads it
-- ============================================================================
-- The roster on a team's page has ordered its heads first and badged them
-- since it was written — and only an Admin ever saw it. `user_roles` has
-- been readable by yourself or an Admin since 0002, so to everybody else
-- the grants came back empty: no badge, no ordering, and a list where the
-- person to ask about a rota clash looks exactly like the person to ask
-- about a camera.
--
-- Which is backwards. Who runs a team is the least private fact about it:
-- it is announced from the front, printed on the rota, and is the first
-- thing a new member needs. What is worth keeping to yourself is the rest
-- of that table — who is an Admin, who signs a service off — and those
-- stay exactly as they were.
--
-- So this widens one shape of row and nothing else: a department_head or
-- assisting_head grant on a team, readable by that team.
-- ----------------------------------------------------------------------------

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select using (
    user_id = auth.uid()
    or public.is_admin(auth.uid())
    or (
      role_type in ('department_head', 'assisting_head')
      and department_id is not null
      and public.can_view_department_content(auth.uid(), department_id)
    )
  );
