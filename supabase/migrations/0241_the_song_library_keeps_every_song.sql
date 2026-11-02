-- The song library: every song ever on a set list, kept for good.
--
-- A set list belongs to its service (0074), and a service is deleted
-- service_retention_days after it (14 by default), so every song typed in
-- was gone a fortnight later — its key, its link, its lyrics. Keeping the
-- services forever would keep every rota and checklist row with them, so
-- the songs get a table of their own instead: one row a song, by its title
-- (ignoring case and spaces), never deleted by the tidy-up.
--
-- Nobody fills it by hand. Adding or changing a song on a set list writes
-- it here (a trigger), so the library knows the latest key, link and words
-- anybody gave it, when it was last sung, and how often. The set list then
-- suggests from it as a title is typed.
--
-- Everyone signed in may read it, as they may read set lists; whoever may
-- keep a set list may correct or remove a song from it.

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0 and length(title) <= 200),
  -- The title as it is matched: lower case, spaces squeezed.
  title_key text generated always as (lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))) stored,
  song_key text check (song_key is null or length(btrim(song_key)) between 1 and 24),
  link text check (link is null or length(link) <= 2000),
  lyrics text check (lyrics is null or length(lyrics) <= 20000),
  last_sung_on date,
  times_sung integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists songs_title_key_idx on public.songs (title_key);

alter table public.songs enable row level security;

drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs
  for select using ((select auth.uid()) is not null);
drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs
  for update using (public.can_edit_set_list((select auth.uid())))
  with check (public.can_edit_set_list((select auth.uid())));
drop policy if exists songs_delete on public.songs;
create policy songs_delete on public.songs
  for delete using (public.can_edit_set_list((select auth.uid())));

/*
 * A song on a set list, into the library: added if new, and otherwise
 * given whatever key, link or words this one has (an empty one leaves the
 * library's as it was). Counted once per set list it is added to.
 */
create or replace function public.song_into_library()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sung date;
begin
  select date into sung from public.services where id = new.service_id;
  insert into public.songs as s (title, song_key, link, lyrics, last_sung_on, times_sung)
  values (btrim(new.title), new.song_key, new.link, new.lyrics, sung,
          case when tg_op = 'INSERT' then 1 else 0 end)
  on conflict (title_key) do update
  -- The latest spelling of it ("Goodness of God", not "goodness of god").
  set title = excluded.title,
      song_key = coalesce(excluded.song_key, s.song_key),
      link = coalesce(excluded.link, s.link),
      lyrics = coalesce(excluded.lyrics, s.lyrics),
      last_sung_on = greatest(s.last_sung_on, excluded.last_sung_on),
      times_sung = s.times_sung + excluded.times_sung,
      updated_at = now();
  return new;
end;
$$;

revoke all on function public.song_into_library() from public, anon, authenticated;

drop trigger if exists set_list_items_into_library on public.set_list_items;
create trigger set_list_items_into_library
  after insert or update of title, song_key, link, lyrics on public.set_list_items
  for each row execute function public.song_into_library();

-- Every song still on a set list today, so the library starts with them.
insert into public.songs (title, song_key, link, lyrics, last_sung_on, times_sung)
select distinct on (lower(regexp_replace(btrim(i.title), '\s+', ' ', 'g')))
       btrim(i.title), i.song_key, i.link, i.lyrics,
       max(sv.date) over w, count(*) over w
from public.set_list_items i
join public.services sv on sv.id = i.service_id
window w as (partition by lower(regexp_replace(btrim(i.title), '\s+', ' ', 'g')))
order by lower(regexp_replace(btrim(i.title), '\s+', ' ', 'g')), sv.date desc, i.updated_at desc
on conflict (title_key) do nothing;

notify pgrst, 'reload schema';
