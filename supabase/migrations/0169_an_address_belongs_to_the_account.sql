-- What the security audit found about accounts, and the doors it closes.
--
-- Four things, all about who somebody is:
--
--   * profiles.email could be rewritten by whoever owned the row. 0127 took
--     the address out of everybody's sight but left the write where it was,
--     and the three readers that treat the address as the account's identity
--     — person_by_email (a Head adding somebody by address), the invitation
--     dedupe, the Owner's contact book — would then answer for an impostor.
--     The address is the account's: only the auth system writes it, and it
--     follows auth.users.
--   * profiles could be deleted by any Admin. 0033 and 0151 put the
--     Owner-only rule on both doors of user_roles but never on the row the
--     pre-request hook (0070) reads, so deleting a fellow Admin's profile
--     locked them out while their grant and account lived on. Nobody deletes
--     a profile by hand; the same guard stands in front of it.
--   * an accepted invitation was never consumed, so somebody removed from a
--     team walked straight back onto it by signing up again at the same
--     address. An invitation admits once, and removing somebody retires it.
--   * the SECURITY DEFINER read helpers that 0151 did not catch were still
--     executable by anon, and a few by every signed-in account although only
--     definer code calls them. The list below finishes that work. Helpers
--     that policies evaluate as the calling role keep EXECUTE for
--     authenticated (a policy cannot call what its role may not), and lose it
--     for anon, who has no business asking.

-- ---------------------------------------------------------------------------
-- The address is the account's
-- ---------------------------------------------------------------------------

create or replace function public.profiles_email_is_the_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A session cannot change it; the sync from auth.users (no session) can.
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'Your email address is your account''s and changes with it.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_email_is_the_accounts() from public, anon, authenticated;

drop trigger if exists profiles_email_is_the_accounts on public.profiles;
create trigger profiles_email_is_the_accounts
  before update of email on public.profiles
  for each row execute function public.profiles_email_is_the_accounts();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- Whatever was written by hand goes back to what the account says.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- Looking somebody up by address asks the account, not the profile, and
-- answers the same way every time.
create or replace function public.person_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found uuid;
begin
  if not (public.may(auth.uid(), 'team.members')
          or exists (select 1 from public.departments d where public.may(auth.uid(), 'team.members', d.id))) then
    raise exception 'Only somebody who can add people to a team can look somebody up.' using errcode = '42501';
  end if;
  select u.id into found
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(btrim(p_email))
  order by u.created_at, u.id
  limit 1;
  return found;
end;
$$;

-- A picture is in the app's own storage, or it is not a picture. The
-- column is rendered as an <img src> for the Heads who see join requests;
-- an address elsewhere would make their browsers call on it.
alter table public.profiles
  drop constraint if exists profiles_avatar_url_is_ours,
  add constraint profiles_avatar_url_is_ours check (
    avatar_url is null
    or avatar_url ~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/'
    or avatar_url ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
  ) not valid;

-- ---------------------------------------------------------------------------
-- A profile goes only with its account
-- ---------------------------------------------------------------------------

drop policy if exists profiles_admin_delete on public.profiles;

create or replace function public.profiles_guard_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No session behind the delete: a cascade from admin_delete_user, a
  -- scheduled job, a migration.
  if auth.uid() is null then
    return old;
  end if;
  if public.is_super_admin(old.id) then
    raise exception 'The owner''s account cannot be removed — transfer ownership first';
  end if;
  if public.is_admin(old.id) and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can remove another Admin';
  end if;
  return old;
end;
$$;

revoke all on function public.profiles_guard_admin_removal() from public, anon, authenticated;

drop trigger if exists profiles_guard_admin_removal on public.profiles;
create trigger profiles_guard_admin_removal
  before delete on public.profiles
  for each row execute function public.profiles_guard_admin_removal();

-- ---------------------------------------------------------------------------
-- An invitation admits once
-- ---------------------------------------------------------------------------

-- The sign-in doorway (0086) joins the team first and stamps accepted_at
-- after, in the same transaction; an invitation accepted before this
-- account existed admitted somebody else.
create or replace function public.join_invited_team(uid uuid, addr text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.department_members (department_id, user_id, member_type)
  select i.department_id, uid, coalesce(i.member_type, 'core'::member_type)
  from public.invitations i
  where uid is not null
    and addr is not null
    and lower(i.email) = lower(addr)
    and i.department_id is not null
    and (i.accepted_at is null
         or i.accepted_at >= (select u.created_at from auth.users u where u.id = uid))
    and exists (select 1 from public.profiles p where p.id = uid)
  on conflict (department_id, user_id) do nothing;
$$;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  addr text;
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

  -- The invitation that admitted them goes with them.
  select email into addr from auth.users where id = target_user_id;
  delete from public.invitations where lower(email) = lower(addr);

  delete from auth.users where id = target_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers the app never calls are not callable (0151, finished)
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  -- Pure readers: only definer functions, triggers and jobs call them.
  foreach fn in array array[
    'public.awaiting_availability(uuid, uuid)',
    'public.awaiting_checklist(uuid, uuid)',
    'public.person_name(uuid)',
    'public.call_time_for(uuid, date)',
    'public.may_mark_team_ready(uuid, uuid, uuid)'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', fn);
    end if;
  end loop;

  -- Policy helpers: a policy runs as the caller, so authenticated keeps
  -- EXECUTE; anon never passes a policy and does not get to ask.
  foreach fn in array array[
    'public.rota_assignment_user(uuid)',
    'public.rota_assignment_department(uuid)',
    'public.rota_assignment_service(uuid)',
    'public.is_admin(uuid)',
    'public.is_super_admin(uuid)',
    'public.is_dept_member(uuid, uuid)',
    'public.is_dept_head(uuid, uuid)',
    'public.is_dept_head_or_assisting(uuid, uuid)',
    'public.is_on_a_team(uuid)',
    'public.is_a_lead(uuid)',
    'public.has_dept_role(uuid, uuid, public.role_type[])',
    'public.can_view_department_content(uuid, uuid)',
    'public.is_any_coordinator(uuid)',
    'public.is_rota_coordinator(uuid, uuid)',
    'public.in_household(uuid, uuid)',
    'public.poll_department(uuid)',
    'public.poll_is_open(uuid)',
    'public.session_service(uuid)',
    'public.next_asset_tag(uuid, text)',
    'public.married_couples()',
    'public.can_open_page(uuid, text)',
    'public.page_level(text)',
    'public.may(uuid, text)',
    'public.may(uuid, text, uuid)',
    'public.may(uuid, text, uuid, uuid)',
    'public.may(uuid, text, uuid, uuid, uuid)',
    'public.permission_reach(text, text)',
    'public.permission_reach(text, text, uuid)',
    'public.is_service_flow_signer(uuid, uuid)',
    'public.is_service_coordinator(uuid, uuid)',
    'public.service_has_finished(uuid)',
    'public.availability_is_closed(uuid)',
    'public.checklist_department(uuid)',
    'public.checklist_service(uuid)',
    'public.stage_may(uuid, text)',
    'public.stage_layout_service(uuid)'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from public, anon', fn);
      execute format('grant execute on function %s to authenticated, service_role', fn);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
