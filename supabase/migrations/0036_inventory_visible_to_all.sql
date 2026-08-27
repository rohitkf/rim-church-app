-- ============================================================================
-- The registers are public within the church; changing them is not
-- ============================================================================
-- Equipment is the one kind of team content everyone benefits from seeing:
-- knowing the church owns a spare radio mic, and which team keeps it, saves
-- the Sunday-morning hunt. Nothing in a register is sensitive — it is a list
-- of objects and where they live — so reading it is open to anyone signed
-- in, while adding, editing, deleting and every movement stay with the
-- team's head, an Admin and the owner.
--
-- Team names come with it: a register you can read is no use if the team it
-- belongs to shows as "Unknown team". Membership, handbooks, rosters and
-- everything else team-owned remain restricted as before.
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments
  for select using (auth.uid() is not null);

drop policy if exists inventory_items_select on public.inventory_items;
create policy inventory_items_select on public.inventory_items
  for select using (auth.uid() is not null);

drop policy if exists inventory_events_select on public.inventory_events;
create policy inventory_events_select on public.inventory_events
  for select using (auth.uid() is not null);
