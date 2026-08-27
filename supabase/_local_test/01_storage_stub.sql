-- Local-test-only stub of Supabase's storage schema. NOT part of the real
-- migration set (Supabase already provides `storage` for you).
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  -- Supabase's own columns for per-bucket upload limits, mirrored here so
  -- migrations that set them can be dry-run against bare Postgres.
  allowed_mime_types text[],
  file_size_limit bigint
);

alter table storage.buckets add column if not exists allowed_mime_types text[];
alter table storage.buckets add column if not exists file_size_limit bigint;

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1 : greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)];
$$;
