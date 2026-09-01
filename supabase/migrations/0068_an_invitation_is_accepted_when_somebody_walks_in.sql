-- ============================================================================
-- An invitation is accepted when somebody walks in, not when a row appears
-- ============================================================================
--
-- `accepted_at` could never be set, so every invitation sat as outstanding
-- for ever — including one whose recipient signed in thirty-two seconds
-- after being invited.
--
-- The order of events is why. `inviteUserByEmail` creates the auth user
-- immediately, `handle_new_user` writes the profile in the same instant,
-- and the old trigger fired on that profile insert looking for a matching
-- invitation — which the edge function only writes a second later, after
-- the mail is away. The trigger was always searching for a row that did
-- not exist yet.
--
-- Fixing the order would have been the wrong repair anyway: it would stamp
-- "accepted" at the moment of inviting, which is precisely the fact the
-- column exists to distinguish. Somebody has accepted an invitation when
-- they have actually got in, so that is what is watched now — the first
-- sign-in.
--
-- It covers the person who was invited and clicked the link, and equally
-- the person who was invited, ignored it, and signed up on their own three
-- weeks later: either way they are through the door and the invitation is
-- no longer outstanding.

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
    update public.invitations
       set accepted_at = now()
     where lower(email) = lower(new.email)
       and accepted_at is null;
  end if;
  return new;
end;
$$;

-- The old one watched the wrong table at the wrong moment.
drop trigger if exists invitations_close_on_signup on public.profiles;
drop function if exists public.close_invitation_on_signup();

drop trigger if exists invitations_close_on_signin on auth.users;
create trigger invitations_close_on_signin
  after insert or update of last_sign_in_at on auth.users
  for each row execute function public.close_invitation_on_signin();

-- What the trigger would have recorded had it worked: anybody holding an
-- outstanding invitation who has in fact already signed in. Their own
-- sign-in time, not now — the record should say when they came in.
update public.invitations i
   set accepted_at = u.last_sign_in_at
  from auth.users u
 where lower(u.email) = lower(i.email)
   and i.accepted_at is null
   and u.last_sign_in_at is not null;
