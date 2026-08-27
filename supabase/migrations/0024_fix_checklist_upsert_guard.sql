-- ============================================================================
-- Fix: verifying an item failed with "Verify only after the volunteer has
-- marked it complete", even when the volunteer had marked it complete
-- ============================================================================
-- The client writes progress with an upsert — INSERT ... ON CONFLICT
-- (assignment_id, item_id) DO UPDATE — because a row only exists once
-- somebody has touched the item.
--
-- Postgres fires BEFORE INSERT triggers *before* it detects the conflict.
-- So on the second write to an item the guard ran once as an INSERT, with
-- OLD null, read the previous stage as 'pending', and rejected the move to
-- head_verified — before the conflict path ever got a chance to run the
-- UPDATE (where OLD is the real row and the check would have passed).
--
-- The stage before is therefore looked up from the table when there is no
-- OLD, which is the truth in both cases. The one-row-per-item unique
-- constraint means this finds at most one row.
create or replace function public.rota_checklist_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dept uuid;
  svc uuid;
  assignee uuid;
  previous public.checklist_item_status;
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;

  dept := public.rota_assignment_department(new.assignment_id);
  svc := public.rota_assignment_service(new.assignment_id);
  assignee := public.rota_assignment_user(new.assignment_id);

  previous := coalesce(
    old.status,
    (
      select p.status
      from public.rota_checklist_progress p
      where p.assignment_id = new.assignment_id and p.item_id = new.item_id
    ),
    'pending'
  );

  if new.status = previous then
    return new;
  end if;

  if new.status = 'member_complete' then
    if auth.uid() is distinct from assignee then
      raise exception 'Only the person holding this role can mark it complete';
    end if;
    if previous <> 'pending' then
      raise exception 'This item has already moved past being marked complete';
    end if;

  elsif new.status = 'head_verified' then
    if not public.is_dept_head(auth.uid(), dept) then
      raise exception 'Only the team head can verify this item';
    end if;
    if previous <> 'member_complete' then
      raise exception 'Verify only after the volunteer has marked it complete';
    end if;

  elsif new.status = 'coordinator_verified' then
    if not public.is_service_flow_signer(auth.uid(), svc) then
      raise exception 'Only Service Flow can give final sign-off';
    end if;
    if previous <> 'head_verified' then
      raise exception 'Sign off only after the team head has verified';
    end if;

  elsif new.status = 'pending' then
    if not public.is_dept_head(auth.uid(), dept) then
      raise exception 'Only the team head can reopen an item';
    end if;
  end if;

  return new;
end;
$$;
