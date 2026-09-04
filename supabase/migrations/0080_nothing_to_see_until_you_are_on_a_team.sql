-- ============================================================================
-- Somebody who has just signed up is not yet part of anything
-- ============================================================================
-- An account is created before anybody has put the person on a team: they
-- sign up, and then a head adds them. In between they could read the whole
-- church — every team's call times, every team's kit, the notice board —
-- which is not what "I have made an account" should buy, and is a strange
-- first impression besides: a wall of other people's arrangements, none of
-- it theirs.
--
-- So the three things that were readable by anyone signed in now ask for
-- one more thing: that you are on a team. The countdown to Sunday, the
-- teams themselves and the services stay open — those are the church's
-- public shape, and they are what a new member should see while they wait.
--
-- "On a team" means a row in department_members, or heading one (a head is
-- attached to their team whether or not somebody also listed them as a
-- member), or being an Admin, who runs all of it.
--
-- The team chat needed nothing: it has been per-team since 0044.
-- ----------------------------------------------------------------------------

create or replace function public.is_on_a_team(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or exists (select 1 from public.department_members m where m.user_id = uid)
    or exists (
      select 1 from public.user_roles r
      where r.user_id = uid
        and r.role_type in ('department_head', 'assisting_head')
        and r.department_id is not null
    )
  );
$$;

-- When each team is due in. Knowing that Worship is called at eight is how
-- whoever opens up knows who to expect — but "whoever opens up" is on a
-- team.
drop policy if exists department_call_times_select on public.department_call_times;
create policy department_call_times_select on public.department_call_times
  for select using (public.is_on_a_team(auth.uid()));

-- The register. 0036 opened it to everyone signed in so that a volunteer
-- could look up another team's kit without being on it; that reasoning
-- holds for volunteers and not for somebody who is on no team at all.
drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items
  for select using (public.is_on_a_team(auth.uid()));

drop policy if exists inventory_events_select on public.inventory_events;
create policy inventory_events_select on public.inventory_events
  for select using (public.is_on_a_team(auth.uid()));

drop policy if exists inventory_documents_select on public.inventory_documents;
create policy inventory_documents_select on public.inventory_documents
  for select using (public.is_on_a_team(auth.uid()));

drop policy if exists inventory_categories_select on public.inventory_categories;
create policy inventory_categories_select on public.inventory_categories
  for select using (
    public.is_on_a_team(auth.uid())
    and public.can_view_department_content(auth.uid(), department_id)
  );

-- The church-wide notice board.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_on_a_team(auth.uid()));
