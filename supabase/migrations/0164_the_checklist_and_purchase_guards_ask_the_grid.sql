/*
 * Two guards that named roles where the grid decides.
 *
 * Like the availability guard (0163), two triggers were written before the
 * church set its own permissions and still answered for themselves:
 *
 *   rota_checklist_guard (0025) let only a team's Head or Assisting Head
 *   verify a checklist item, or undo one, whatever "Tick off and verify
 *   somebody else's checklist" (day.verify) said. The grid gives the rota's
 *   Coordinator that right for their team at their service out of the box;
 *   the policy let their tick through and this trigger refused it.
 *
 *   guard_purchase_request (0065) let only an Admin, Head or Assisting Head
 *   approve or refuse a purchase request, whatever "Approve, refuse or
 *   delete a purchase request" (inv.purchase_decide) said, so a team that
 *   gave it to its members would see Approve and have it refused.
 *
 * Both now ask may() the grid's own question, for that team (and service).
 * The order of the stages, the person's own tick, Service Flow's sign-off,
 * an Admin putting a service right, and the purchase request's untouchable
 * fields are all unchanged. Under today's settings nothing changes for
 * anybody but a Coordinator, who can now verify for their team as the grid
 * already said.
 */

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

  -- An upsert fires this as an INSERT before the conflict is detected, so
  -- OLD is null even when the row exists; read the real previous stage.
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

  -- The volunteer's own tick, and taking it back.
  if previous = 'pending' and new.status = 'member_complete' then
    if auth.uid() is distinct from assignee then
      raise exception 'Only the person holding this role can mark it complete';
    end if;

  elsif previous = 'member_complete' and new.status = 'pending' then
    if auth.uid() is distinct from assignee and not public.may(auth.uid(), 'day.verify', dept, svc) then
      raise exception 'Only the person holding this role, or whoever may verify for their team, can undo this';
    end if;

  -- The head's verification, and taking it back.
  elsif previous = 'member_complete' and new.status = 'head_verified' then
    if not public.may(auth.uid(), 'day.verify', dept, svc) then
      raise exception 'Only whoever may verify for this team can verify this item';
    end if;

  elsif previous = 'head_verified' and new.status = 'member_complete' then
    if not public.may(auth.uid(), 'day.verify', dept, svc) then
      raise exception 'Only whoever may verify for this team can undo the verification';
    end if;

  -- Service Flow's sign-off, and taking it back.
  elsif previous = 'head_verified' and new.status = 'coordinator_verified' then
    if not public.is_service_flow_signer(auth.uid(), svc) then
      raise exception 'Only Service Flow can give final sign-off';
    end if;

  elsif previous = 'coordinator_verified' and new.status = 'head_verified' then
    if not public.is_service_flow_signer(auth.uid(), svc) then
      raise exception 'Only Service Flow can undo the final sign-off';
    end if;

  else
    -- Anything else skips a stage or reaches past one that is already set:
    -- a volunteer changing a verified item, a head undoing a signed-off
    -- one, a jump straight from pending to signed off.
    raise exception 'Undo the later stage first — % cannot become % directly', previous, new.status;
  end if;

  return new;
end;
$$;

create or replace function public.guard_purchase_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  may_decide boolean;
begin
  new.updated_at := now();
  -- Who asked, and when, are not the sort of thing an edit changes.
  new.requested_by := old.requested_by;
  new.department_id := old.department_id;
  new.created_at := old.created_at;

  if new.status is distinct from old.status then
    may_decide := public.may(auth.uid(), 'inv.purchase_decide', old.department_id);
    if not may_decide then
      raise exception 'Deciding this team''s purchase requests is not yours to do';
    end if;
    -- The decision is stamped here rather than trusted to the form, so the
    -- record of who said yes cannot be edited into somebody else's name.
    new.decided_by := auth.uid();
    new.decided_at := now();
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
