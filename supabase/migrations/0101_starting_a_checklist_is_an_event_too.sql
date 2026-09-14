/*
 * Starting a checklist is an event too.
 *
 * 0100 went through every table that holds part of a service and gave each
 * one a line in the feed. One was missed on the first pass because it looks
 * like plumbing rather than news: `checklists` is a bare join of a team and
 * a service, created the moment somebody opens the panel and starts one.
 *
 * But it is the moment a team's preparation begins, and its deletion takes
 * every tick, verification and sign-off with it — which is precisely the
 * kind of change the feed exists to make visible to everybody. The ticks
 * themselves were already recorded; the thing holding them was not.
 */
create or replace function public.activity_from_checklist_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_now record := coalesce(new, old);
  team text;
begin
  select name into team from public.departments where id = row_now.department_id;

  perform public.record_activity(
    row_now.service_id, row_now.department_id, auth.uid(), 'checklist', team,
    case when tg_op = 'INSERT' then 'started the checklist' else 'took the checklist down' end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists activity_checklist_started on public.checklists;
create trigger activity_checklist_started
  after insert or delete on public.checklists
  for each row execute function public.activity_from_checklist_started();
