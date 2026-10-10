/*
 * The church sets its own permissions: Teams & roles.
 *
 * Making and removing teams, their name, colour and handbook, who is on
 * them, their roles, groups and standing checklists, and requests to join.
 * Who can make somebody a Head stays an Admin's (The app itself): whoever
 * can hand out roles can hand themselves any of them.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('team.create', 'admin', '{none,all}', 'all'),
  ('team.create', 'head', '{none,all}', 'none'),
  ('team.create', 'coordinator', '{none}', 'none'),
  ('team.create', 'member', '{none,all}', 'none'),
  ('team.create', 'newcomer', '{none}', 'none'),
  ('team.edit', 'admin', '{none,all}', 'all'),
  ('team.edit', 'head', '{none,team,all}', 'team'),
  ('team.edit', 'coordinator', '{none}', 'none'),
  ('team.edit', 'member', '{none,team,all}', 'none'),
  ('team.edit', 'newcomer', '{none}', 'none'),
  ('team.members', 'admin', '{none,all}', 'all'),
  ('team.members', 'head', '{none,team,all}', 'team'),
  ('team.members', 'coordinator', '{none}', 'none'),
  ('team.members', 'member', '{none,team,all}', 'none'),
  ('team.members', 'newcomer', '{none}', 'none'),
  ('team.roles', 'admin', '{none,all}', 'all'),
  ('team.roles', 'head', '{none,team,all}', 'team'),
  ('team.roles', 'coordinator', '{none}', 'none'),
  ('team.roles', 'member', '{none,team,all}', 'none'),
  ('team.roles', 'newcomer', '{none}', 'none'),
  ('team.groups', 'admin', '{none,all}', 'all'),
  ('team.groups', 'head', '{none,team,all}', 'team'),
  ('team.groups', 'coordinator', '{none}', 'none'),
  ('team.groups', 'member', '{none,team,all}', 'none'),
  ('team.groups', 'newcomer', '{none}', 'none'),
  ('team.checklists', 'admin', '{none,all}', 'all'),
  ('team.checklists', 'head', '{none,team,all}', 'team'),
  ('team.checklists', 'coordinator', '{none}', 'none'),
  ('team.checklists', 'member', '{none,team,all}', 'none'),
  ('team.checklists', 'newcomer', '{none}', 'none'),
  ('team.join', 'admin', '{none,all}', 'all'),
  ('team.join', 'head', '{none,team,all}', 'team'),
  ('team.join', 'coordinator', '{none}', 'none'),
  ('team.join', 'member', '{none,team,all}', 'none'),
  ('team.join', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

alter policy departments_admin_write on public.departments
  with check (public.may(auth.uid(), 'team.create'));

alter policy departments_admin_delete on public.departments
  using (public.may(auth.uid(), 'team.create'));

alter policy departments_head_update on public.departments
  using (public.may(auth.uid(), 'team.edit', id))
  with check (public.may(auth.uid(), 'team.edit', id));

-- A handbook lives in a folder named for its team.

alter policy handbooks_insert on storage.objects
  with check ((bucket_id = 'handbooks') and public.may(auth.uid(), 'team.edit', ((storage.foldername(name))[1])::uuid));

alter policy handbooks_update on storage.objects
  using ((bucket_id = 'handbooks') and public.may(auth.uid(), 'team.edit', ((storage.foldername(name))[1])::uuid));

alter policy handbooks_delete on storage.objects
  using ((bucket_id = 'handbooks') and public.may(auth.uid(), 'team.edit', ((storage.foldername(name))[1])::uuid));

alter policy department_members_write on public.department_members
  using (public.may(auth.uid(), 'team.members', department_id))
  with check (public.may(auth.uid(), 'team.members', department_id));

alter policy department_roles_write on public.department_roles
  using (public.may(auth.uid(), 'team.roles', department_id))
  with check (public.may(auth.uid(), 'team.roles', department_id));

alter policy department_role_groups_write on public.department_role_groups
  using (public.may(auth.uid(), 'team.groups', department_id))
  with check (public.may(auth.uid(), 'team.groups', department_id));

alter policy department_role_checklist_items_write on public.department_role_checklist_items
  using (public.may(auth.uid(), 'team.checklists', department_id))
  with check (public.may(auth.uid(), 'team.checklists', department_id));

alter policy team_join_requests_select on public.team_join_requests
  using ((user_id = auth.uid()) or public.may(auth.uid(), 'team.join', department_id));

CREATE OR REPLACE FUNCTION public.respond_team_join(request_id uuid, accept boolean, as_type member_type DEFAULT 'core'::member_type)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  request public.team_join_requests;
begin
  select * into request from public.team_join_requests where id = request_id;
  if request is null or request.status <> 'pending' then
    raise exception 'That request is no longer open';
  end if;
  if not (
    public.may(auth.uid(), 'team.join', request.department_id)
  ) then
    raise exception 'Answering requests to join that team is not open to you.';
  end if;

  update public.team_join_requests
  set status = (case when accept then 'approved' else 'declined' end)::join_request_status,
      responded_at = now(),
      responded_by = auth.uid(),
      granted_type = case when accept then as_type end
  where id = request_id;

  if accept then
    insert into public.department_members (user_id, department_id, member_type)
    values (request.user_id, request.department_id, as_type)
    on conflict do nothing;
  end if;

  insert into public.notifications (user_id, type, reference_id)
  values (
    request.user_id,
    case when accept then 'team_join_approved' else 'team_join_declined' end,
    request_id
  );
end;
$function$;

-- Looking somebody up by address is how a member is added who is not yet on any list.

CREATE OR REPLACE FUNCTION public.person_by_email(p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  found uuid;
begin
  if not (public.may(auth.uid(), 'team.members')
          or exists (select 1 from public.departments d where public.may(auth.uid(), 'team.members', d.id))) then
    raise exception 'Only somebody who can add people to a team can look somebody up.' using errcode = '42501';
  end if;
  select p.id into found
  from public.profiles p
  where lower(p.email) = lower(btrim(p_email))
  limit 1;
  return found;
end;
$function$;

notify pgrst, 'reload schema';
