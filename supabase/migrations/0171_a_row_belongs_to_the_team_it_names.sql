-- What the security audit found about rows that name a team, a service or
-- a person, and the doors it closes.
--
-- A policy that reads a column the caller wrote is asking the caller. Seven
-- places did:
--
--   * availability: anybody signed in could answer for a team they are not
--     on (0014 asked only user_id = auth.uid()), which made them a recipient
--     of that team's alerts and a name on its page. An answer is for a team
--     you are on.
--   * availability_guard_own_answer (0163) pinned the row's identity on
--     NEW, so writing user_id = self first made the row your own. It pins
--     on OLD.
--   * a late ask could be rewritten by its decider before approval and the
--     approval wrote whatever it then said. An ask is decided as it was
--     made.
--   * inventory_documents checked the row's own department_id, never the
--     item's team. A document belongs to its item's team.
--   * the inventory-docs and giving buckets let any signed-in account read
--     every file although the rows that point at them follow the page's
--     access rule (0123). A file is readable by whoever may read the row.
--   * checklist_items had no stage guard: the person holding a task could
--     sign it off as Head and Service Flow with any ids in the body, move
--     it to another team's list, and change a finished service. It gets
--     the guard its sibling list has had since 0025.
--   * the Coordinator profile was minted by writing the word on a rota row,
--     which anybody with rota.assign could do for themselves. Naming the
--     Coordinator is a Head's, an Admin's, or a verifier's decision.

-- ---------------------------------------------------------------------------
-- An answer is for a team you are on
-- ---------------------------------------------------------------------------

alter policy availability_insert on public.availability
  with check ((not public.service_has_finished(service_id)) and (
    public.may(auth.uid(), 'avail.add_others', department_id, service_id)
    or (user_id = auth.uid()
        and public.is_dept_member(auth.uid(), department_id)
        and not public.availability_is_closed(service_id))));

alter policy availability_update on public.availability
  using (public.may(auth.uid(), 'avail.edit_others', department_id, service_id)
         or (user_id = auth.uid()
             and public.is_dept_member(auth.uid(), department_id)
             and not public.availability_is_closed(service_id)))
  with check (public.may(auth.uid(), 'avail.edit_others', department_id, service_id)
         or (user_id = auth.uid()
             and public.is_dept_member(auth.uid(), department_id)
             and not public.availability_is_closed(service_id)));

alter policy availability_delete on public.availability
  using ((not public.service_has_finished(service_id)) and (
    public.may(auth.uid(), 'avail.add_others', department_id, service_id)
    or (user_id = auth.uid()
        and public.is_dept_member(auth.uid(), department_id)
        and not public.availability_is_closed(service_id))));

-- An answer keeps its owner: the row as it is, not as the write says.
create or replace function public.availability_guard_own_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid())
     and (new.user_id is distinct from old.user_id
          or new.service_id is distinct from old.service_id
          or new.department_id is distinct from old.department_id) then
    raise exception 'An availability answer cannot be moved to another person or service';
  end if;
  if old.user_id <> auth.uid()
     and not public.is_admin(auth.uid())
     and not public.may(auth.uid(), 'avail.edit_others', old.department_id, old.service_id)
     and not public.availability_write_is_approval(old.user_id, old.service_id, old.department_id) then
    if new.status is distinct from old.status then
      raise exception 'Only the volunteer can change their own availability';
    end if;
    if new.note is distinct from old.note then
      raise exception 'Only the volunteer can change their own note';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- A late ask is decided as it was made
-- ---------------------------------------------------------------------------

create or replace function public.guard_availability_change_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Who asked, for what, and about which answer are not the decider's to change.
  new.user_id := old.user_id;
  new.service_id := old.service_id;
  new.department_id := old.department_id;
  new.requested_status := old.requested_status;
  new.reason := old.reason;
  new.created_at := old.created_at;
  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'This request has already been decided';
    end if;
    if auth.uid() is not null
       and not public.may(auth.uid(), 'avail.late_decide', old.department_id, old.service_id) then
      raise exception 'Deciding this team''s late asks is not yours to do' using errcode = '42501';
    end if;
    if public.service_has_finished(old.service_id) then
      raise exception 'That service has finished — there is nothing left to answer for.';
    end if;
    new.decided_by := coalesce(auth.uid(), new.decided_by);
    new.decided_at := now();
  else
    new.decided_by := old.decided_by;
    new.decided_at := old.decided_at;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_availability_change_request() from public, anon, authenticated;

drop trigger if exists availability_change_requests_guard on public.availability_change_requests;
create trigger availability_change_requests_guard
  before update on public.availability_change_requests
  for each row execute function public.guard_availability_change_request();

-- ---------------------------------------------------------------------------
-- A document belongs to its item's team
-- ---------------------------------------------------------------------------

alter policy inventory_documents_write on public.inventory_documents
  using (exists (
    select 1 from public.inventory_items i
    where i.id = item_id and public.may(auth.uid(), 'inv.items', i.department_id)))
  with check (exists (
    select 1 from public.inventory_items i
    where i.id = item_id and public.may(auth.uid(), 'inv.items', i.department_id)));

create or replace function public.inventory_document_follows_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select i.department_id into new.department_id from public.inventory_items i where i.id = new.item_id;
  if new.department_id is null then
    raise exception 'That item is gone.';
  end if;
  if tg_op = 'INSERT' then
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  else
    new.uploaded_by := old.uploaded_by;
  end if;
  return new;
end;
$$;

revoke all on function public.inventory_document_follows_item() from public, anon, authenticated;

drop trigger if exists inventory_documents_follow_item on public.inventory_documents;
create trigger inventory_documents_follow_item
  before insert or update on public.inventory_documents
  for each row execute function public.inventory_document_follows_item();

-- ---------------------------------------------------------------------------
-- A file is readable by whoever may read the row that points at it
-- ---------------------------------------------------------------------------

alter policy inventory_docs_select on storage.objects
  using (bucket_id = 'inventory-docs' and (select public.can_open_page(auth.uid(), 'inventory')));

alter policy giving_select on storage.objects
  using (bucket_id = 'giving' and (select public.can_open_page(auth.uid(), 'giving')));

-- ---------------------------------------------------------------------------
-- A task keeps its stages (the guard rota_checklist_progress has had since 0025)
-- ---------------------------------------------------------------------------

create or replace function public.checklist_item_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dept uuid := public.checklist_department(old.checklist_id);
  svc uuid := public.checklist_service(old.checklist_id);
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;

  -- The row stays on its list, with the person its Head gave it to.
  if new.checklist_id is distinct from old.checklist_id then
    raise exception 'A task stays on its checklist';
  end if;
  if new.assigned_to is distinct from old.assigned_to
     and not public.is_dept_head_or_assisting(auth.uid(), dept) then
    raise exception 'Only the team''s Head or Assisting Head can hand a task to somebody else';
  end if;

  -- Who did what is stamped here, never read from the body.
  if new.status = old.status then
    new.completed_by := old.completed_by;
    new.completed_at := old.completed_at;
    new.verified_by_head := old.verified_by_head;
    new.verified_by_head_at := old.verified_by_head_at;
    new.verified_by_coordinator := old.verified_by_coordinator;
    new.verified_by_coordinator_at := old.verified_by_coordinator_at;
    return new;
  end if;

  if public.service_has_finished(svc) then
    raise exception 'That service has finished — its checklist is closed.';
  end if;

  new.completed_by := old.completed_by;
  new.completed_at := old.completed_at;
  new.verified_by_head := old.verified_by_head;
  new.verified_by_head_at := old.verified_by_head_at;
  new.verified_by_coordinator := old.verified_by_coordinator;
  new.verified_by_coordinator_at := old.verified_by_coordinator_at;

  if old.status = 'pending' and new.status = 'member_complete' then
    if auth.uid() is distinct from old.assigned_to then
      raise exception 'Only the person holding this task can mark it complete';
    end if;
    new.completed_by := auth.uid();
    new.completed_at := now();

  elsif old.status = 'member_complete' and new.status = 'pending' then
    if auth.uid() is distinct from old.assigned_to
       and not public.may(auth.uid(), 'day.verify', dept, svc) then
      raise exception 'Only the person holding this task, or whoever may verify for their team, can undo this';
    end if;
    new.completed_by := null;
    new.completed_at := null;

  elsif old.status = 'member_complete' and new.status = 'head_verified' then
    if not public.may(auth.uid(), 'day.verify', dept, svc) then
      raise exception 'Only whoever may verify for this team can verify this task';
    end if;
    new.verified_by_head := auth.uid();
    new.verified_by_head_at := now();

  elsif old.status = 'head_verified' and new.status = 'member_complete' then
    if not public.may(auth.uid(), 'day.verify', dept, svc) then
      raise exception 'Only whoever may verify for this team can undo the verification';
    end if;
    new.verified_by_head := null;
    new.verified_by_head_at := null;

  elsif old.status = 'head_verified' and new.status = 'coordinator_verified' then
    if not public.is_service_flow_signer(auth.uid(), svc) then
      raise exception 'Only Service Flow can give final sign-off';
    end if;
    new.verified_by_coordinator := auth.uid();
    new.verified_by_coordinator_at := now();

  elsif old.status = 'coordinator_verified' and new.status = 'head_verified' then
    if not public.is_service_flow_signer(auth.uid(), svc) then
      raise exception 'Only Service Flow can undo the final sign-off';
    end if;
    new.verified_by_coordinator := null;
    new.verified_by_coordinator_at := null;

  else
    raise exception 'Undo the later stage first — % cannot become % directly', old.status, new.status;
  end if;

  return new;
end;
$$;

revoke all on function public.checklist_item_guard() from public, anon, authenticated;

drop trigger if exists checklist_item_guard on public.checklist_items;
create trigger checklist_item_guard
  before update on public.checklist_items
  for each row execute function public.checklist_item_guard();

-- ---------------------------------------------------------------------------
-- Naming the Coordinator is not the same as filling the rota
-- ---------------------------------------------------------------------------

create or replace function public.rota_coordinator_label_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new; -- a cascade, a job, a migration
  end if;
  if lower(btrim(new.role_label)) in ('coordinator', 'team coordinator')
     and (tg_op = 'INSERT'
          or lower(btrim(old.role_label)) not in ('coordinator', 'team coordinator')
          or new.user_id is distinct from old.user_id
          or new.department_id is distinct from old.department_id
          or new.service_id is distinct from old.service_id)
     and not (
       public.is_admin(auth.uid())
       or public.is_dept_head_or_assisting(auth.uid(), new.department_id)
       or (new.user_id is distinct from auth.uid()
           and public.may(auth.uid(), 'day.verify', new.department_id, new.service_id)
           and public.may(auth.uid(), 'day.ready', new.department_id, new.service_id))
     ) then
    raise exception 'Only an Admin, the team''s Head or Assisting Head, or somebody who already verifies for the team can name its Coordinator.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.rota_coordinator_label_guard() from public, anon, authenticated;

drop trigger if exists rota_coordinator_label_guard on public.rota_assignments;
create trigger rota_coordinator_label_guard
  before insert or update of role_label, user_id, department_id, service_id on public.rota_assignments
  for each row execute function public.rota_coordinator_label_guard();

notify pgrst, 'reload schema';
