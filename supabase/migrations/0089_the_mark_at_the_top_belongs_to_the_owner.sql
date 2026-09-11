/*
 * The logo is the owner's to choose.
 *
 * The mark in the top-left has been a hard-coded "RIM" tile since the
 * shell was built — which is fine for this church and wrong for the app,
 * and wrong for this church too the day it has a real logo. It becomes a
 * setting.
 *
 * Not an ordinary one, though. Every other row of app_settings is a
 * number an Admin may tune — how many days of rota, how early the doors
 * open — and the mark at the top of every page is not that kind of
 * number. It is the church's identity, so it is the owner's, and the
 * guard below is what makes the distinction real rather than a label on a
 * settings page.
 */

alter table public.app_settings add column if not exists logo_url text;

/*
 * Column-level permission, which RLS does not do.
 *
 * app_settings_write already lets any Admin update the row, and a policy
 * cannot say "except this column". A trigger can: an Admin editing the
 * clocks leaves logo_url alone and never meets this, and an Admin trying
 * to change the mark is stopped whichever way they come at it — the app,
 * the API, or psql.
 *
 * It fires before app_settings_touch, alphabetically, which is the order
 * triggers run in and the order that matters: the guard decides before
 * anything records that a change happened.
 */
create or replace function public.app_settings_logo_is_the_owners()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.logo_url is distinct from old.logo_url
     and not public.is_super_admin(auth.uid()) then
    raise exception 'Only the owner can change the app logo';
  end if;
  return new;
end;
$$;

drop trigger if exists app_settings_logo_is_the_owners on public.app_settings;
create trigger app_settings_logo_is_the_owners
  before update on public.app_settings
  for each row execute function public.app_settings_logo_is_the_owners();

/*
 * Where the file lives.
 *
 * Private, like every other bucket here: a signed URL is a few lines in
 * the app and it keeps the church's storage from being a public host.
 * Two megabytes is generous for a mark that is drawn at 36 pixels, and
 * the mime list is the formats a browser will actually draw. SVG is on it
 * because a logo is the one image that genuinely wants to be vector; it
 * is only ever rendered as an <img> src, where a script inside it cannot
 * run, and only the owner can put one there.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists branding_select on storage.objects;
drop policy if exists branding_insert on storage.objects;
drop policy if exists branding_update on storage.objects;
drop policy if exists branding_delete on storage.objects;

-- Everybody signed in sees the mark; that is the whole point of it.
create policy branding_select on storage.objects
  for select using (bucket_id = 'branding' and auth.uid() is not null);

create policy branding_insert on storage.objects
  for insert with check (bucket_id = 'branding' and public.is_super_admin(auth.uid()));

create policy branding_update on storage.objects
  for update using (bucket_id = 'branding' and public.is_super_admin(auth.uid()));

create policy branding_delete on storage.objects
  for delete using (bucket_id = 'branding' and public.is_super_admin(auth.uid()));
