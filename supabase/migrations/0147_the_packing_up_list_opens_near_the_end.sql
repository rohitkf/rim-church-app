/*
 * The packing-up list opens near the end, not before.
 *
 * 0115 gave the "After the service" half a window of its own, but only an
 * end to it: it could be ticked from the team's call time onwards (and by
 * an Admin at any time), so "cameras packed away" could be ticked before a
 * camera had been switched on. A tick is meant to say a thing was done,
 * and the after half is work that can only be done once the service is
 * wrapping up.
 *
 * So it now opens `after_service_checklist_opens_minutes` before the
 * service ends — twenty unless the church says otherwise in App settings
 * › Timings — and closes as before, `after_service_checklist_minutes`
 * after. The end is the same one the rest of the app uses: End service if
 * it was pressed (so pressing it early opens the list at once), otherwise
 * the planned end of the last session.
 *
 * A service with neither has no end to count back from, so its after half
 * stays shut until somebody presses End service. It used to be open.
 *
 * This is the clock, not the who: it is asked on every write, Admins
 * included (rota_checklist_progress_write, 0136).
 */

alter table public.app_settings
  add column if not exists after_service_checklist_opens_minutes integer not null default 20
    check (after_service_checklist_opens_minutes between 0 and 240);

create or replace function public.checklist_item_writable(p_assignment uuid, p_item uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  svc uuid := public.rota_assignment_service(p_assignment);
  ended timestamptz;
  item_phase text;
  opens_before integer;
  stays_after integer;
begin
  select i.phase into item_phase from public.department_role_checklist_items i where i.id = p_item;
  if item_phase = 'post' then
    ended := public.service_ended_at(svc);
    if ended is null then
      return false;
    end if;
    select s.after_service_checklist_opens_minutes, s.after_service_checklist_minutes
      into opens_before, stays_after
      from public.app_settings s;
    return now() >= ended - make_interval(mins => coalesce(opens_before, 20))
       and now() <= ended + make_interval(mins => coalesce(stays_after, 120));
  end if;
  return not public.service_has_finished(svc);
end;
$function$;

notify pgrst, 'reload schema';
