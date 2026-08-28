-- ============================================================================
-- The rest of a finished service closes with it
-- ============================================================================
-- 0046 froze the running order once a service was over. This does the same
-- for the two things that hang off it: the checklists for that service and
-- the availability answers for it. A Sunday that has happened stops being
-- something anyone can quietly re-decide.
--
-- One deliberate exception, and it is the only one: whether somebody
-- actually turned up. That is recorded after the doors close as often as
-- before them — a head ticking through who came while the hall empties —
-- and locking it would leave the dashboard's turnout permanently wrong for
-- every service anybody was slow to fill in. The answer they gave
-- beforehand is frozen; whether they honoured it is not.
-- ----------------------------------------------------------------------------

-- Checklists: the whole three-stage chain closes. A stage ticked after the
-- service is not preparation, it is paperwork.
drop policy if exists rota_checklist_progress_write on public.rota_checklist_progress;
create policy rota_checklist_progress_write on public.rota_checklist_progress
  for all
  using (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or auth.uid() = public.rota_assignment_user(assignment_id)
      or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
      or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
    )
  )
  with check (
    not public.service_has_finished(public.rota_assignment_service(assignment_id))
    and (
      public.is_admin(auth.uid())
      or auth.uid() = public.rota_assignment_user(assignment_id)
      or public.is_dept_head(auth.uid(), public.rota_assignment_department(assignment_id))
      or public.is_service_flow_signer(auth.uid(), public.rota_assignment_service(assignment_id))
    )
  );

-- Availability: no new answers for a service that has been and gone, and
-- no taking one back either.
drop policy if exists availability_insert on public.availability;
create policy availability_insert on public.availability
  for insert
  with check (
    not public.service_has_finished(service_id)
    and (user_id = auth.uid() or public.is_admin(auth.uid()))
  );

drop policy if exists availability_delete on public.availability;
create policy availability_delete on public.availability
  for delete
  using (
    not public.service_has_finished(service_id)
    and (user_id = auth.uid() or public.is_admin(auth.uid()))
  );

-- Changing an answer needs to be told apart from recording who came, and a
-- policy cannot see the row as it was — only a trigger can compare the two.
create or replace function public.guard_finished_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and public.service_has_finished(new.service_id) then
    raise exception 'That service has finished — availability can no longer be changed.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_finished_availability on public.availability;
create trigger guard_finished_availability
  before update on public.availability
  for each row execute function public.guard_finished_availability();

-- And nobody is chased about a service that is over. The reminder buttons
-- are hidden by then, but the function is the thing that must refuse.
create or replace function public.nudge_availability(dept_id uuid, svc_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.may_alert_department(auth.uid(), dept_id) then
    raise exception 'Only an Admin or that team''s head can send this.';
  end if;
  if public.service_has_finished(svc_id) then
    raise exception 'That service has finished — there is nothing left to answer for.';
  end if;
  return public.notify_people(
    array(select user_id from public.awaiting_availability(dept_id, svc_id)),
    'availability_reminder',
    svc_id
  );
end;
$$;

-- The same for the checklist reminder.
create or replace function public.nudge_checklist(svc_id uuid, dept_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if dept_id is null then
    if not public.is_admin(auth.uid()) then
      raise exception 'Only an Admin can nudge every team at once.';
    end if;
  elsif not public.may_alert_department(auth.uid(), dept_id) then
    raise exception 'Only an Admin or that team''s head can send this.';
  end if;
  if public.service_has_finished(svc_id) then
    raise exception 'That service has finished — its checklists are closed.';
  end if;
  return public.notify_people(
    array(select user_id from public.awaiting_checklist(svc_id, dept_id)),
    'checklist_reminder',
    svc_id
  );
end;
$$;
