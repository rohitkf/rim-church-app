/*
 * The church sets its own permissions: People.
 *
 * Editing somebody else's profile and picture, inviting people, clearing
 * old records, and removing an account. Fixed, and not here: contact
 * details, visa and DBS (the Owner's), your own profile (yours), and who
 * is an Admin or a Head (an Admin's — whoever can hand out roles can hand
 * themselves any of them). Only the Owner can remove another Admin.
 *
 * Every rule below asks `may()` (0133) instead of naming a role, and the
 * defaults in the catalog are exactly what the rules said before — so
 * applying this changes nothing for anybody until somebody changes a cell
 * in Settings › Access & privileges.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('people.edit_others', 'admin', '{none,all}', 'all'),
  ('people.edit_others', 'head', '{none}', 'none'),
  ('people.edit_others', 'coordinator', '{none}', 'none'),
  ('people.edit_others', 'member', '{none}', 'none'),
  ('people.edit_others', 'newcomer', '{none}', 'none'),
  ('people.invite', 'admin', '{none,all}', 'all'),
  ('people.invite', 'head', '{none,team,all}', 'team'),
  ('people.invite', 'coordinator', '{none}', 'none'),
  ('people.invite', 'member', '{none,team,all}', 'none'),
  ('people.invite', 'newcomer', '{none}', 'none'),
  ('people.clear_records', 'admin', '{none,all}', 'all'),
  ('people.clear_records', 'head', '{none,all}', 'none'),
  ('people.clear_records', 'coordinator', '{none}', 'none'),
  ('people.clear_records', 'member', '{none,all}', 'none'),
  ('people.clear_records', 'newcomer', '{none}', 'none'),
  ('people.remove', 'admin', '{none,all}', 'all'),
  ('people.remove', 'head', '{none}', 'none'),
  ('people.remove', 'coordinator', '{none}', 'none'),
  ('people.remove', 'member', '{none}', 'none'),
  ('people.remove', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

alter policy profiles_update_own_or_admin on public.profiles
  using ((id = auth.uid()) or public.may(auth.uid(), 'people.edit_others'))
  with check ((id = auth.uid()) or public.may(auth.uid(), 'people.edit_others'));

-- A picture lives in a folder named for its person.

alter policy avatars_insert on storage.objects
  with check ((bucket_id = 'avatars') and (public.may(auth.uid(), 'people.edit_others') or (((storage.foldername(name))[1])::uuid = auth.uid())));

alter policy avatars_update on storage.objects
  using ((bucket_id = 'avatars') and (public.may(auth.uid(), 'people.edit_others') or (((storage.foldername(name))[1])::uuid = auth.uid())));

alter policy avatars_delete on storage.objects
  using ((bucket_id = 'avatars') and (public.may(auth.uid(), 'people.edit_others') or (((storage.foldername(name))[1])::uuid = auth.uid())));

alter policy invitations_select on public.invitations
  using (public.may(auth.uid(), 'people.invite', department_id));

alter policy invitations_delete on public.invitations
  using (public.may(auth.uid(), 'people.clear_records'));

alter policy team_join_requests_admin_delete on public.team_join_requests
  using (public.may(auth.uid(), 'people.clear_records') and (status <> 'pending'::join_request_status));

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.may(auth.uid(), 'people.remove') then
    raise exception 'Removing accounts is not open to you.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'You cannot remove your own account';
  end if;
  if public.is_super_admin(target_user_id) then
    raise exception 'The owner''s account cannot be removed — transfer ownership first';
  end if;
  if public.is_admin(target_user_id) and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can remove another Admin''s account';
  end if;

  delete from auth.users where id = target_user_id;
end;
$function$;

/*
 * Who may send an invitation, asked by the invite edge function (which
 * runs with the service key, so it names the caller). With no team, any
 * team they may invite to will do — which is what "a Head can invite
 * somebody to no team" always meant.
 */
create or replace function public.may_invite(uid uuid, dept uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select case
    when dept is null then
      public.may(uid, 'people.invite')
      or exists (select 1 from public.departments d where public.may(uid, 'people.invite', d.id))
    else public.may(uid, 'people.invite', dept)
  end;
$function$;

revoke all on function public.may_invite(uuid, uuid) from public, anon, authenticated;
grant execute on function public.may_invite(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
