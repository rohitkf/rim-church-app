/*
 * An account that is never confirmed is removed.
 *
 * Signing up makes the account at once and sends a link; the account is
 * of no use until the link is pressed. When the address was mistyped the
 * link goes nowhere, nobody ever presses it, and the account stays for
 * good: a profile for a person who does not exist, with an address that
 * is somebody else's or nobody's. The Owner, November 2026: "it doesn't
 * make sense to save that email to database if the email itself is wrong
 * or doesn't exist".
 *
 * The form now catches what a form can (its shape, its ending, whether
 * its domain takes mail at all). What it cannot tell is whether there is
 * a mailbox, and the only proof of that is the link being pressed. So an
 * account whose link has not been pressed after seven days is taken to be
 * one that never will be, and is removed. Whoever it was can sign up
 * again, with the right address this time.
 *
 * Removed only when all of this is true, so that nothing anybody did on
 * purpose is undone:
 *
 *   - it was never confirmed, by email or by phone, and nobody has ever
 *     signed in with it;
 *   - it was made by signing up, not by an invitation (an invited person
 *     is expected, and has been put on a team already), nor through a
 *     single sign-on or as an anonymous visitor;
 *   - seven days have passed since it was made *and* since the link was
 *     last sent: "Send it again" starts the seven days over;
 *   - nothing has been given to it. An Admin can put a person on a
 *     session, a rota or a team, or link a guest to them, before they
 *     ever confirm; such an account is somebody's and is left alone.
 *
 * "Nothing given to it" is read off the schema and not off a list of
 * tables: every foreign key in `public` that points at a person is asked
 * about, and a row in any of them keeps the account — except the few
 * tables that hold only what every person gets without anybody choosing
 * them: the profile signing up makes, and what is sent to everybody
 * (notifications, the tour, the prompt to allow location). So a table
 * added next year counts as a reason to keep an account until somebody
 * says otherwise here. It fails towards keeping.
 *
 * It runs once a day. Deleting the account takes its profile with it, as
 * removing a person always has.
 */

create or replace function public.delete_unconfirmed_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  -- How long a link may go unpressed. The app says the same number where
  -- it says the link was sent (lib/unconfirmedAccounts.ts); a test holds
  -- the two together.
  days constant integer := 7;
  -- What every person has without anybody having chosen them for it.
  given_to_everybody constant text[] := array[
    'public.profiles', 'public.profile_sensitive', 'public.notifications', 'public.onboarding', 'public.location_access'
  ];
  account record;
  ref record;
  held boolean;
  gone integer := 0;
begin
  for account in
    select u.id
    from auth.users u
    where u.email_confirmed_at is null
      and u.phone_confirmed_at is null
      and u.last_sign_in_at is null
      and u.invited_at is null
      and not coalesce(u.is_sso_user, false)
      and not coalesce(u.is_anonymous, false)
      and greatest(u.created_at, coalesce(u.confirmation_sent_at, u.created_at)) < now() - make_interval(days => days)
      and u.id not in (select o.user_id from public.app_owner o)
  loop
    held := false;
    for ref in
      select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.connamespace = 'public'::regnamespace
        and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
        and array_length(c.conkey, 1) = 1
        and not exists (select 1 from unnest(given_to_everybody) as t(name) where to_regclass(t.name) = c.conrelid)
    loop
      execute format('select exists (select 1 from %s where %I = $1)', ref.tbl, ref.col) into held using account.id;
      exit when held;
    end loop;
    continue when held;

    delete from auth.users where id = account.id;
    gone := gone + 1;
  end loop;
  return gone;
end;
$function$;

comment on function public.delete_unconfirmed_accounts() is
  'Removes accounts made by signing up that were never confirmed, seven days after the link was last sent, when nothing has been given to them. Run daily; answers how many went.';

-- Run by the timer and by nobody else.
revoke all on function public.delete_unconfirmed_accounts() from public, anon, authenticated;

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'delete-unconfirmed-accounts';
    perform cron.schedule('delete-unconfirmed-accounts', '25 3 * * *', 'select public.delete_unconfirmed_accounts()');
  end if;
end;
$cron$;
select public.migration_done(317, '0317_an_account_never_confirmed_is_removed', '137453be9136d7654883839e60f54589993d8cbbb03c9f2d36258f5ee1b293a3');
