/*
 * A Pastor comments on a session; the Admins and the Owner read it
 * (asked for by the Owner, November 2026).
 *
 * The running order says what is planned and who is taking it. It had no
 * place for the Pastor to say something about one session — "keep this to
 * ten minutes", "I would like the reading before the song" — except by
 * telling somebody, who then had to remember. Now a session carries
 * comments, and they are not the team's to read: a comment is the
 * Pastor's word to whoever runs the church, not a note on the sheet.
 *
 * Two new rights, each a row in the grid, each a choice of No or
 * Everywhere for every role (sessions belong to the service, not to a
 * team, so there is no "their own team" to offer):
 *
 *   svc.comment        Comment on sessions. A Pastor's out of the box,
 *                      nobody else's — an Admin's is No until the church
 *                      says otherwise. The Owner, as everywhere, passes.
 *   svc.comment_read   Read the comments on sessions. An Admin's out of
 *                      the box (and the Owner's), nobody else's. Not a
 *                      Pastor's: one Pastor does not read another's
 *                      unless the church gives them this too.
 *
 * Whoever wrote a comment always reads their own — your own things are
 * outside the grid (AGENTS.md §6) — and may delete it. Nobody edits one:
 * a comment the Admins have read does not change under them; delete it
 * and say it again. Nobody else deletes one either, a reader included.
 *
 * There is no guard about time: a comment after the service ("that ran
 * long") is as wanted as one before it. Nothing is sent to anybody's
 * phone; the planner shows the comments to whoever may read them.
 *
 * Nothing here is used by the app already in production, so this goes
 * before the release, as every migration does.
 */

create table public.service_session_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.service_sessions(id) on delete cascade,
  -- Kept when the person goes: what was said outlives who said it.
  author uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

comment on table public.service_session_comments is
  'What somebody with svc.comment (a Pastor, out of the box) said about one session. Read by its author and by whoever holds svc.comment_read (the Admins and the Owner, out of the box) — never by the team.';

-- Looked up by session on the planner; by author when a person is removed
-- and in the read policy's "your own".
create index service_session_comments_session_idx on public.service_session_comments (session_id, created_at);
create index service_session_comments_author_idx on public.service_session_comments (author);

alter table public.service_session_comments enable row level security;

-- Your own, or everybody's if you may read them.
create policy service_session_comments_select on public.service_session_comments
  for select to authenticated
  using (
    author = (select auth.uid())
    or (select public.may((select auth.uid()), 'svc.comment_read'))
  );

-- In your own name only, and only with the right to comment.
create policy service_session_comments_insert on public.service_session_comments
  for insert to authenticated
  with check (author = auth.uid() and public.may(auth.uid(), 'svc.comment'));

-- Your own. No update policy at all: a comment is never edited.
create policy service_session_comments_delete on public.service_session_comments
  for delete to authenticated
  using (author = auth.uid());

revoke all on public.service_session_comments from anon;
revoke all on public.service_session_comments from authenticated;
grant select, insert, delete on public.service_session_comments to authenticated;

-- Screens hear that it changed (0202): the name of the table and nothing
-- of what was said.
create trigger service_session_comments_live after insert or update or delete on public.service_session_comments
  for each statement execute function public.live_table_changed();

-- ---------------------------------------------------------------------------
-- The two rights
-- ---------------------------------------------------------------------------

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('svc.comment', 'admin', '{none,all}', 'none'),
  ('svc.comment', 'head', '{none,all}', 'none'),
  ('svc.comment', 'assistant', '{none,all}', 'none'),
  ('svc.comment', 'coordinator', '{none,all}', 'none'),
  ('svc.comment', 'member', '{none,all}', 'none'),
  ('svc.comment', 'newcomer', '{none,all}', 'none'),
  ('svc.comment', 'overwatch', '{none,all}', 'none'),
  ('svc.comment', 'pastor', '{none,all}', 'all'),
  ('svc.comment_read', 'admin', '{none,all}', 'all'),
  ('svc.comment_read', 'head', '{none,all}', 'none'),
  ('svc.comment_read', 'assistant', '{none,all}', 'none'),
  ('svc.comment_read', 'coordinator', '{none,all}', 'none'),
  ('svc.comment_read', 'member', '{none,all}', 'none'),
  ('svc.comment_read', 'newcomer', '{none,all}', 'none'),
  ('svc.comment_read', 'overwatch', '{none,all}', 'none'),
  ('svc.comment_read', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;
select public.migration_done(308, '0308_a_pastor_comments_on_a_session', '9169423e23ba72f7e0710d70acd5d8f8084990ae7daa48844c2c23103ae0183b');
