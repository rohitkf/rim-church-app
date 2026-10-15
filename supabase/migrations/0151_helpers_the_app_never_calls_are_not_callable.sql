-- Helpers the app never calls are not callable, and Admin cannot be
-- edited away.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and Supabase
-- adds anon and authenticated on top. So a SECURITY DEFINER helper that
-- was only ever meant to be called by a trigger or a nightly job is also
-- an RPC anyone can call — signed in or not — and it runs with the
-- owner's rights. Most of ours check `auth.uid()` or `may()` first. These
-- five do not, because they trust whoever called them to be the database:
--
--   join_invited_team(uid, addr)    puts `uid` on the team of any
--                                   invitation sent to `addr`. Called
--                                   directly, it let anyone join a team
--                                   by naming somebody else's invited
--                                   address — or put any account on it.
--   clear_message_board_if_due()    on the board's clear day, deleted
--                                   every message, notification and
--                                   activity line, as often as anybody
--                                   asked, all day long.
--   record_activity(...)            wrote a feed line naming any actor,
--                                   so a member could post "the Owner
--                                   did this".
--   ensure_coordinator_role(dept)   adds a role name to a team.
--   delete_expired_debriefs()       the debrief clean-up.
--
-- Every caller of these is itself SECURITY DEFINER (the sign-in and
-- profile triggers, the activity_from_* triggers, the new-team trigger)
-- or a pg_cron job, and all of those run as the owner, who keeps EXECUTE.
-- The app and the assistant backend call none of them.
revoke all on function public.join_invited_team(uuid, text) from public, anon, authenticated;
revoke all on function public.clear_message_board_if_due() from public, anon, authenticated;
revoke all on function public.record_activity(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.ensure_coordinator_role(uuid) from public, anon, authenticated;
revoke all on function public.delete_expired_debriefs() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin cannot be edited away
-- ---------------------------------------------------------------------------
-- 0033 says only the Owner takes Admin from somebody else, and guards it
-- with a BEFORE DELETE trigger. But `user_roles_admin_write` is FOR ALL,
-- so an Admin could do the same thing with an UPDATE: turn another Admin's
-- row into a Head's, or move it onto a different person. Same rule, now on
-- the other door. Changing an admin row in place is taking Admin from its
-- holder whenever the result is no longer that person's admin grant.
create or replace function public.user_roles_guard_admin_edit()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if old.role_type <> 'admin' then
    return new;
  end if;
  if new.role_type = 'admin' and new.user_id = old.user_id then
    return new;
  end if;
  -- No session behind the change: a cascade, a scheduled job, a migration.
  if auth.uid() is null then
    return new;
  end if;
  if public.is_super_admin(old.user_id) then
    raise exception 'The owner''s Admin access cannot be removed — transfer ownership first';
  end if;
  if public.is_super_admin(auth.uid()) or old.user_id = auth.uid() then
    return new;
  end if;
  raise exception 'Only the owner can remove another Admin';
end;
$function$;

drop trigger if exists user_roles_guard_admin_edit on public.user_roles;
create trigger user_roles_guard_admin_edit
  before update on public.user_roles
  for each row execute function public.user_roles_guard_admin_edit();

revoke all on function public.user_roles_guard_admin_edit() from public, anon, authenticated;
