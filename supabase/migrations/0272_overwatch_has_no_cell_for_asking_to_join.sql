/*
 * Overwatch has no cell for asking to join a team.
 *
 * 0270 gave Overwatch a cell on every row may() answers for. Walking each
 * new cell through its page and its function found one that could not do
 * what it said: request_team_join() refuses Overwatch outright — it sees
 * every team already, and is put on one by a Head, not by asking (0187) —
 * so "Ask to join a team" set to Everywhere for Overwatch changed
 * nothing. A cell that does nothing is worse than a dash: this one is
 * fixed at No again. Nobody had changed it.
 */

delete from public.role_permissions where role_key = 'overwatch' and capability = 'team.request_join';

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('team.request_join', 'overwatch', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

notify pgrst, 'reload schema';
