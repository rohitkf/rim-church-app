/*
 * Nobody signed out calls the database's functions.
 *
 * Postgres grants EXECUTE on every new function to PUBLIC, and Supabase's
 * default privileges add anon by name, so 100 of the app's functions were
 * callable by a request with no account at all: 36 of them security
 * definer. Each one that changes anything already refuses a caller with no
 * account (admin_reset_data is the owner's, admin_delete_user needs
 * people.remove), and 0169 closed the read helpers. But nine read-only
 * helpers still answered anybody — is_any_department_head(uid),
 * availability_closes_at(svc) and the like — and every new function
 * started open (AGENTS.md §6 has been a reminder to close each by hand).
 *
 * No page the app shows signed out calls a function: sign-in, sign-up and
 * password reset talk to Supabase Auth, and the settings row the login
 * page reads asks only auth.uid(). So every function in public is closed
 * to anon and to PUBLIC, except reject_removed_user, the PostgREST
 * pre-request hook (0070), which runs on every request, signed out ones
 * included.
 *
 * Closing PUBLIC must not close anyone else: whoever of authenticated and
 * service_role could run a function before is granted it by name first.
 * Trigger functions need no grant to fire.
 *
 * New functions start closed to anon from here on: the schema's default
 * privileges stop naming anon, and postgres's functions stop going to
 * PUBLIC. A function a signed-out request must call needs its own grant.
 */

do $fns$
declare
  f record;
  r text;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname <> 'reject_removed_user'
  loop
    foreach r in array array['authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = r)
         and has_function_privilege(r, f.oid, 'execute') then
        execute format('grant execute on function %s to %I', f.sig, r);
      end if;
    end loop;
    execute format('revoke execute on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', f.sig);
    end if;
  end loop;
end $fns$;

do $defaults$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    alter default privileges for role postgres in schema public revoke execute on functions from anon;
  end if;
  alter default privileges for role postgres revoke execute on functions from public;
end $defaults$;
