-- A Songs page: the song library (0241) kept by hand as well as by the
-- set lists.
--
-- 0241's library filled itself from set lists. Now the songs can be added
-- before anybody sings them — the words, the key, a link to learn it from —
-- on a page of their own, and the set list's song box finds them there.
--
-- Who may add, change and remove a song is a row in the church's grid,
-- `songs.edit`, and the teams it reaches are chosen team by team in
-- Settings › Page by Page › Songs. Out of the box: the worship team (its
-- Head, Assisting Heads and members), and the Admins and the Owner; any
-- other team is added by ticking it there. Everybody signed in may read
-- the library, as they may read set lists.
--
-- The set lists' trigger still writes into the library whoever adds the
-- song there, so a song sung is never lost because its singer could not
-- add to the library by hand.

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('songs.edit', 'admin', '{none,all}', 'all'),
  ('songs.edit', 'head', '{none,team,all}', 'none'),
  ('songs.edit', 'assistant', '{none,team,all}', 'none'),
  ('songs.edit', 'coordinator', '{none,team}', 'none'),
  ('songs.edit', 'member', '{none,team,all}', 'none'),
  ('songs.edit', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The worship team's own cells: its people may keep the library.
insert into public.department_permissions (department_id, role_key, capability, reach)
select d.id, r.role_key, 'songs.edit', 'team'
from public.departments d
cross join (values ('head'), ('assistant'), ('member')) as r(role_key)
where d.is_worship
on conflict do nothing;

/*
 * May this person keep the song library? The grid's cell church-wide, or
 * for any team they are on (its roster, its Heads and Assisting Heads).
 */
create or replace function public.may_edit_songs(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.may(uid, 'songs.edit', null::uuid)
    or exists (
      select 1 from (
        select m.department_id from public.department_members m where m.user_id = uid
        union
        select r.department_id from public.user_roles r
        where r.user_id = uid and r.department_id is not null
          and r.role_type in ('department_head', 'assisting_head')
      ) mine
      where public.may(uid, 'songs.edit', mine.department_id)
    )
  )
$$;

revoke all on function public.may_edit_songs(uuid) from public, anon;
grant execute on function public.may_edit_songs(uuid) to authenticated;

drop policy if exists songs_insert on public.songs;
create policy songs_insert on public.songs
  for insert with check (public.may_edit_songs((select auth.uid())));
drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs
  for update using (public.may_edit_songs((select auth.uid())))
  with check (public.may_edit_songs((select auth.uid())));
drop policy if exists songs_delete on public.songs;
create policy songs_delete on public.songs
  for delete using (public.may_edit_songs((select auth.uid())));

notify pgrst, 'reload schema';
