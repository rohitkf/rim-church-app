-- Local-test-only stub of Supabase's auth schema (auth.users, auth.uid()).
-- This file is NOT part of the real migration set applied to a Supabase
-- project (Supabase already provides `auth` for you) — it exists purely so
-- these migrations can be dry-run against a bare Postgres instance in CI /
-- local dev to catch SQL errors before pushing to Supabase.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- Real Supabase keeps this; a migration that watches for somebody's first
  -- sign-in needs it to exist here too, or the dry run fails on a column the
  -- actual database has had all along.
  last_sign_in_at timestamptz
);

-- For a local database created before the column was added to the stub above.
alter table auth.users add column if not exists last_sign_in_at timestamptz;

-- What real Supabase keeps about whether an account was ever confirmed:
-- the clean-up of never-confirmed accounts (0317) reads these.
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists phone_confirmed_at timestamptz;
alter table auth.users add column if not exists confirmation_sent_at timestamptz;
alter table auth.users add column if not exists invited_at timestamptz;
alter table auth.users add column if not exists is_sso_user boolean not null default false;
alter table auth.users add column if not exists is_anonymous boolean not null default false;

create or replace function auth.uid() returns uuid
language sql stable
as $$ select null::uuid; $$;
