/*
 * The Countdown page (/countdown): the running order's clock, large and
 * read-only, for whoever keeps the time (asked for by the Owner, November
 * 2026).
 *
 * Who opens it is a row in the grid, like every page with a choice (0215):
 * `page.countdown`, out of the box anybody on a team and not a Church
 * Member, and Page by Page can open it to everyone or narrow it to the
 * Heads. Its cells:
 *
 *   Admin, Team Head, Assisting Head   yes, always
 *   Team Member                        yes — or no, for a page for Heads
 *   Church Member                      no — or yes, for a page for everyone
 *   Team Coordinator                   no — they open it as the Team
 *                                      Member they are
 *
 * The page hides itself only: what it shows — the services and their
 * sessions — is read on the Service Planner already, and nothing here
 * changes who may read them.
 */
insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('page.countdown', 'admin', '{all}', 'all'),
  ('page.countdown', 'head', '{all}', 'all'),
  ('page.countdown', 'assistant', '{all}', 'all'),
  ('page.countdown', 'coordinator', '{none}', 'none'),
  ('page.countdown', 'member', '{none,all}', 'all'),
  ('page.countdown', 'newcomer', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

notify pgrst, 'reload schema';
