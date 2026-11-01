-- An event is seen by who it is for (0237).
--
-- Choosing teams for an event said whose it was, but everybody who could
-- open Events still saw it. Now the choice is who sees it too:
--
--   * no team (Whole church): everybody who may open Events, as before;
--   * some teams (or All teams): the people on them, and whoever may read
--     those teams anyway (their heads and assistants, Admins, Overwatch —
--     may_read_team), plus whoever added it and whoever may add events for
--     the whole church (which takes in the Owner).
--
-- A repeating series (0235) is seen the same way, so the rows it makes and
-- the row that makes them never disagree.

create or replace function public.may_see_event(teams uuid[], creator uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_open_page(auth.uid(), 'events')
     and (
       cardinality(coalesce(teams, '{}')) = 0
       or creator = auth.uid()
       or public.may(auth.uid(), 'svc.events', null::uuid)
       or exists (select 1 from unnest(teams) d where public.may_read_team(d))
     )
$$;

revoke all on function public.may_see_event(uuid[], uuid) from public, anon;
grant execute on function public.may_see_event(uuid[], uuid) to authenticated;

alter policy church_events_select on public.church_events
  using (public.may_see_event(department_ids, created_by));

alter policy church_event_series_select on public.church_event_series
  using (public.may_see_event(department_ids, created_by));

notify pgrst, 'reload schema';
