-- ============================================================================
-- Checklist stages can be undone by whoever set them
-- ============================================================================
-- The chain only ever ran forwards: a mis-tap by a volunteer, a head or the
-- Service Flow signer was permanent, since the only backwards move allowed
-- was a head reopening an item to pending.
--
-- Each stage is now a box its own actor can tick and untick, and nobody can
-- disturb a stage below one that is already set:
--
--   pending            <-> member_complete        the volunteer holding the
--                                                 role (a head may also
--                                                 reopen it)
--   member_complete    <-> head_verified          the team head or an
--                                                 assisting head
--   head_verified      <-> coordinator_verified   the Service Flow signer
--
-- So a volunteer can untick their own item right up until their head
-- verifies it, and the head can untick their verification right up until
-- Service Flow signs it off. Undoing from the top down is always possible;
-- reaching past a set stage never is.
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
    if auth.uid() is distinct from assignee and not public.is_dept_head(auth.uid(), dept) then
      raise exception 'Only the person holding this role, or their team head, can undo this';
    end if;

  -- The head's verification, and taking it back.
  elsif previous = 'member_complete' and new.status = 'head_verified' then
    if not public.is_dept_head(auth.uid(), dept) then
      raise exception 'Only the team head can verify this item';
    end if;

  elsif previous = 'head_verified' and new.status = 'member_complete' then
    if not public.is_dept_head(auth.uid(), dept) then
      raise exception 'Only the team head can undo their verification';
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
