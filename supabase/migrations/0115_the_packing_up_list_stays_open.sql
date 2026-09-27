/*
 * The packing-up list stays open after the service.
 *
 * "After the service" items are, by definition, done once the service has
 * ended: the cables coiled, the cameras packed, the hall locked. They used
 * to close with everything else, so the page stopped offering the boxes at
 * the very moment the work began, and the ticks went unrecorded.
 *
 * So the after half has a window of its own: open until
 * `after_service_checklist_minutes` past the end (two hours unless the
 * church says otherwise in App settings), then closed. The before half is
 * unchanged — it is over when the service is (service_has_finished, which
 * already allows the correction grace).
 *
 * The end is the one the rest of the app uses: when End service was
 * pressed, or else the planned end of the last session. A service with
 * neither has not ended, and nothing about it is closing.
 */

alter table public.app_settings
  add column if not exists after_service_checklist_minutes integer not null default 120
    check (after_service_checklist_minutes between 0 and 1440);

-- When a service ended, or null if it has not got an end to speak of.
create or replace function public.service_ended_at(svc_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ended_at from public.services where id = svc_id),
    (select max(start_time + make_interval(mins => coalesce(duration_minutes, 0)))
     from public.service_sessions where service_id = svc_id)
  );
$$;

revoke all on function public.service_ended_at(uuid) from public, anon;
grant execute on function public.service_ended_at(uuid) to authenticated;

/*
 * Whether this item of this assignment's checklist can still be ticked,
 * as far as the clock is concerned. Who may tick it is the policy's and
 * rota_checklist_guard's business, not this.
 */
create or replace function public.checklist_item_writable(p_assignment uuid, p_item uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  svc uuid := public.rota_assignment_service(p_assignment);
  ended timestamptz;
  item_phase text;
begin
  select i.phase into item_phase from public.department_role_checklist_items i where i.id = p_item;
  if item_phase = 'post' then
    ended := public.service_ended_at(svc);
    return ended is null
      or now() <= ended + make_interval(
        mins => (select after_service_checklist_minutes from public.app_settings)
      );
  end if;
  return not public.service_has_finished(svc);
end;
$$;

revoke all on function public.checklist_item_writable(uuid, uuid) from public, anon;
grant execute on function public.checklist_item_writable(uuid, uuid) to authenticated;

-- The same policy as before, with the clock asked per item rather than
-- per service.
drop policy if exists rota_checklist_progress_write on public.rota_checklist_progress;
create policy rota_checklist_progress_write on public.rota_checklist_progress
  for all
  using (
    public.checklist_item_writable(assignment_id, item_id)
    and (
      public.is_admin(auth.uid())
      or (
        public.assignment_checklist_is_open(assignment_id)
        and (
          auth.uid() = public.rota_assignment_user(assignment_id)
          or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
          or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
          or public.is_rota_coordinator(auth.uid(), assignment_id)
        )
      )
    )
  )
  with check (
    public.checklist_item_writable(assignment_id, item_id)
    and (
      public.is_admin(auth.uid())
      or (
        public.assignment_checklist_is_open(assignment_id)
        and (
          auth.uid() = public.rota_assignment_user(assignment_id)
          or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
          or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
          or public.is_rota_coordinator(auth.uid(), assignment_id)
        )
      )
    )
  );
