/*
 * Church updates.
 *
 * The things a church tells everybody that are not an event with a date
 * and not an alert that needs reading this minute: the new building
 * hours, a thank-you after the harvest, who has joined the pastoral team.
 * They had nowhere to live — an announcement is a buzz and then gone, and
 * the diary only holds things that happen on a day.
 *
 * A page every member can read, Church Members included, newest first,
 * with an Admin able to pin one to the top. Posting tells everybody —
 * in the app and on their phone, never by email — through notify_people,
 * which skips the author.
 *
 * Written only through post_church_update, so there is no insert policy;
 * an Admin edits, pins and deletes directly.
 */

create table if not exists public.church_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 5000),
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists church_updates_recent_idx on public.church_updates (pinned desc, created_at desc);

alter table public.church_updates enable row level security;

drop policy if exists church_updates_select on public.church_updates;
create policy church_updates_select on public.church_updates
  for select using (auth.uid() is not null);

drop policy if exists church_updates_update on public.church_updates;
create policy church_updates_update on public.church_updates
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists church_updates_delete on public.church_updates;
create policy church_updates_delete on public.church_updates
  for delete using (public.is_admin(auth.uid()));

create or replace function public.post_church_update(title text, body text, pinned boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  made uuid;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only an Admin can post a church update.' using errcode = '42501';
  end if;
  if title is null or length(btrim(title)) = 0 then
    raise exception 'An update needs a title.';
  end if;
  if body is null or length(btrim(body)) = 0 then
    raise exception 'An update needs something to say.';
  end if;

  insert into public.church_updates (title, body, pinned, created_by)
  values (btrim(title), btrim(body), coalesce(pinned, false), auth.uid())
  returning id into made;

  -- Everybody, in the app and on their phone. The words on the lock screen
  -- are the title; the rest is a tap away.
  perform public.notify_people(
    array(select id from public.profiles),
    'church_update',
    made,
    btrim(title)
  );
  return made;
end;
$$;

revoke all on function public.post_church_update(text, text, boolean) from public, anon;
grant execute on function public.post_church_update(text, text, boolean) to authenticated;

do $pub$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'church_updates'
  ) then
    alter publication supabase_realtime add table public.church_updates;
  end if;
end $pub$;
