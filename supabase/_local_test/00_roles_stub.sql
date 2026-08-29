-- Local-test-only stub of the roles Supabase creates for you.
--
-- Every Supabase project ships with the `anon`, `authenticated` and
-- `service_role` roles that PostgREST switches into, so migrations can write
-- `... to authenticated` in their policies. A bare Postgres image has none of
-- them, and `create policy ... to authenticated` fails with
-- `role "authenticated" does not exist`.
--
-- This file is NOT part of the real migration set applied to a Supabase
-- project — it exists purely so these migrations can be dry-run against a bare
-- Postgres instance in CI / local dev to catch SQL errors before pushing.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
