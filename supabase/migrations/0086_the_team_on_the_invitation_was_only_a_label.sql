-- ============================================================================
-- The team on an invitation was only a label
-- ============================================================================
-- "Invite somebody" asks which team, stores the answer on the invitation,
-- and then nothing ever happens with it. It decided one thing only: which
-- Head could see the invitation in their list. So an Admin inviting Grace
-- into Media watched Grace arrive on no team at all, and had to go and add
-- her by hand — having already said, at the only moment anyone asked, which
-- team she was for.
--
-- The answer is now acted on: accepting the invitation joins the team.
--
-- **Accepting, not being invited.** 0068 established when an invitation is
-- accepted — the first sign-in, because `inviteUserByEmail` creates the auth
-- user and its profile the instant the invite is sent, and neither of those
-- means anybody walked in. The same moment is used here, so a team's roster
-- never lists somebody who has not yet turned up.
--
-- **Two doorways, because there are two ways in.** The invited person who
-- clicks the link is caught by the sign-in trigger, where their profile has
-- existed since the invitation went out. The person who was invited, ignored
-- it, and signed up on their own weeks later has no profile at the moment
-- that trigger runs — triggers on one table fire in alphabetical order, and
-- `invitations_close_on_signin` sorts before `on_auth_user_created`, so the
-- profile their membership must reference does not exist yet. That one is
-- caught as the profile is written instead.
--
-- The second doorway checks they have actually signed in, which is what
-- keeps it from firing at invite time: `handle_new_user` writes the profile
-- while `last_sign_in_at` is still null, and joining a team then would put a
-- name on a roster days before its owner has heard of the app.
--
-- Both go through one function and both are idempotent, so a person arriving
-- through both doorways at once joins once.

/**
 * Put somebody on the team they were invited into.
 *
 * Silent when there is no invitation, when it named no team, when they are
 * already a member, or when their profile is not written yet — a sign-in
 * must never fail over a roster.
 */
create or replace function public.join_invited_team(uid uuid, addr text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.department_members (department_id, user_id, member_type)
  select i.department_id, uid, 'core'::member_type
  from public.invitations i
  where uid is not null
    and addr is not null
    and lower(i.email) = lower(addr)
    and i.department_id is not null
    -- The membership points at a profile; without one the insert would
    -- fail, and this is running inside somebody's sign-in.
    and exists (select 1 from public.profiles p where p.id = uid)
  on conflict (department_id, user_id) do nothing;
$$;

-- ---------------------------------------------------------------------------
-- Doorway one: the invited person signs in for the first time
-- ---------------------------------------------------------------------------

create or replace function public.close_invitation_on_signin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the crossing from "never signed in" to "signed in". Every
  -- subsequent sign-in updates the same column, and an invitation is not
  -- accepted afresh each morning.
  if new.last_sign_in_at is not null
     and (tg_op = 'INSERT' or old.last_sign_in_at is null)
  then
    -- The team first: after `accepted_at` is stamped the invitation is
    -- still there to read, but doing it in this order means one statement
    -- cannot leave an invitation marked accepted by a person who was not
    -- joined.
    perform public.join_invited_team(new.id, new.email);

    update public.invitations
       set accepted_at = now()
     where lower(email) = lower(new.email)
       and accepted_at is null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Doorway two: somebody invited long ago signs up on their own
-- ---------------------------------------------------------------------------

create or replace function public.join_invited_team_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Not at invite time. The profile is written the instant the invitation
  -- is sent, and a roster should not name somebody who has not arrived.
  if exists (
    select 1 from auth.users u
    where u.id = new.id and u.last_sign_in_at is not null
  ) then
    perform public.join_invited_team(new.id, new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_join_invited_team on public.profiles;
create trigger profiles_join_invited_team
  after insert on public.profiles
  for each row execute function public.join_invited_team_on_profile();

-- ---------------------------------------------------------------------------
-- Anybody the label was already lost on
-- ---------------------------------------------------------------------------
-- Invitations that named a team, were accepted, and never put anybody on it.
-- Their membership is dated from when they arrived rather than from now: the
-- roster should say when they joined, not when this was fixed.
insert into public.department_members (department_id, user_id, member_type, created_at)
select i.department_id, p.id, 'core'::member_type, coalesce(i.accepted_at, now())
from public.invitations i
join public.profiles p on lower(p.email) = lower(i.email)
where i.department_id is not null
  and i.accepted_at is not null
on conflict (department_id, user_id) do nothing;
