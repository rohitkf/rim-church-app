-- Check all: tick every item on a role at once (asked for by the Owner).
--
-- A role's checklist can be twenty items, each ticked box by box. Check
-- all ticks every one of them, in the half that is open, up to the
-- furthest box the person pressing it may sign: Sign-off for Service Flow
-- (and the Owner and Admins), Head/Coordinator for whoever may verify that
-- team, Done otherwise. Nothing already ticked further is taken back.
--
-- Who may press it is a row in the church's grid, `day.check_all`, so it
-- can be widened in Settings › Access & Privileges: the Owner always may,
-- and by default nobody else.
--
-- An item whose half is not open yet (before the team's call time) is
-- left alone and counted as skipped, rather than failing the rest.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('day.check_all', 'admin', '{none,all}', 'none'),
  ('day.check_all', 'head', '{none,team,all}', 'none'),
  ('day.check_all', 'assistant', '{none,team,all}', 'none'),
  ('day.check_all', 'coordinator', '{none,team}', 'none'),
  ('day.check_all', 'member', '{none,team,all}', 'none'),
  ('day.check_all', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The stage-by-stage guard (0136), unchanged but for letting Check all's
-- own writes through.
create or replace function public.rota_checklist_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $guard$
declare
  dept uuid;
  svc uuid;
  assignee uuid;
  previous public.checklist_item_status;
begin
  if public.is_admin(auth.uid()) then
    return new;
  end if;

  -- Check all (0232): checklist_check_all has already asked may() for
  -- day.check_all, and sets this flag only for its own writes.
  if coalesce(current_setting('rim.check_all', true), '') = '1' then
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
$guard$;

create or replace function public.checklist_check_all(p_assignment uuid, p_phase text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  a record;
  target public.checklist_item_status;
  target_rank int;
  item record;
  current_status public.checklist_item_status;
  ticked int := 0;
  skipped int := 0;
  stamp timestamptz := now();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if p_phase not in ('pre', 'post') then raise exception 'Not a half of the checklist: %', p_phase; end if;

  select ra.id, ra.role_id, ra.department_id, ra.service_id, ra.include_pre, ra.include_post
    into a from public.rota_assignments ra where ra.id = p_assignment;
  if not found then raise exception 'That role is not on the rota any more.'; end if;

  if not public.may(me, 'day.check_all', a.department_id, a.service_id) then
    raise exception 'Checking a whole list at once is not open to you.' using errcode = '42501';
  end if;
  if (p_phase = 'pre' and a.include_pre is false) or (p_phase = 'post' and a.include_post is false) then
    return jsonb_build_object('ticked', 0, 'skipped', 0, 'target', null);
  end if;

  target := case
    -- The Owner and Admins sign off any team's list, as the page lets them.
    when public.is_admin(me) or public.is_service_flow_signer(me, a.service_id) then 'coordinator_verified'
    when public.may(me, 'day.verify', a.department_id, a.service_id) then 'head_verified'
    else 'member_complete'
  end;
  target_rank := case target when 'coordinator_verified' then 3 when 'head_verified' then 2 else 1 end;

  perform set_config('rim.check_all', '1', true);
  for item in
    select i.id from public.department_role_checklist_items i
    where i.role_id = a.role_id and i.phase = p_phase
    order by i.sort_order
  loop
    select p.status into current_status from public.rota_checklist_progress p
    where p.assignment_id = a.id and p.item_id = item.id;
    if (case coalesce(current_status, 'pending') when 'coordinator_verified' then 3 when 'head_verified' then 2 when 'member_complete' then 1 else 0 end) >= target_rank then
      continue;
    end if;
    begin
      insert into public.rota_checklist_progress as p (
        assignment_id, item_id, status, completed_by, completed_at,
        verified_by_head, verified_by_head_at, verified_by_coordinator, verified_by_coordinator_at
      ) values (
        a.id, item.id, target, me, stamp,
        case when target_rank >= 2 then me end, case when target_rank >= 2 then stamp end,
        case when target_rank >= 3 then me end, case when target_rank >= 3 then stamp end
      )
      on conflict (assignment_id, item_id) do update set
        status = excluded.status,
        completed_by = coalesce(p.completed_by, excluded.completed_by),
        completed_at = coalesce(p.completed_at, excluded.completed_at),
        verified_by_head = coalesce(p.verified_by_head, excluded.verified_by_head),
        verified_by_head_at = coalesce(p.verified_by_head_at, excluded.verified_by_head_at),
        verified_by_coordinator = coalesce(p.verified_by_coordinator, excluded.verified_by_coordinator),
        verified_by_coordinator_at = coalesce(p.verified_by_coordinator_at, excluded.verified_by_coordinator_at);
      ticked := ticked + 1;
    exception when others then
      -- Its half is not open yet, or the service is past: leave it.
      skipped := skipped + 1;
    end;
  end loop;
  perform set_config('rim.check_all', '', true);

  return jsonb_build_object('ticked', ticked, 'skipped', skipped, 'target', target);
end;
$$;

revoke all on function public.checklist_check_all(uuid, text) from public, anon;
grant execute on function public.checklist_check_all(uuid, text) to authenticated;

notify pgrst, 'reload schema';
