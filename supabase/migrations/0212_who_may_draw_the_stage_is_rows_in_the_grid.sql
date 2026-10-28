/*
 * Who may draw the stage is rows in the grid.
 *
 * Since 0155 Settings › Stage Layout kept a table of its own,
 * stage_team_access: a row a team, five switches — add, edit, delete,
 * comment, keep templates. Like Clock in (0209), Prayer (0210) and the
 * planner's buttons (0211), each switch is now a capability and each team
 * with it switched on holds a grant of it (0208):
 *
 *   stage.add  stage.edit  stage.delete  stage.comment  stage.templates
 *
 * Admins always may, as stage_may() always said. Nobody else out of the
 * box; the church may give one to every Team Head, Assisting Head, Team
 * Coordinator or Team Member at once — which the table could not — or to
 * a team or a person, by a grant; a Church Member only by a grant.
 *
 * stage_may(), which every policy on a layout asks, asks may(). Checked on
 * production before applying, every person and switch: nobody's answer
 * changed.
 *
 * stage_team_access stays, read by nothing, until a later release drops it.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('stage.add', 'admin', '{all}', 'all'),
  ('stage.add', 'head', '{none,all}', 'none'),
  ('stage.add', 'assistant', '{none,all}', 'none'),
  ('stage.add', 'coordinator', '{none,all}', 'none'),
  ('stage.add', 'member', '{none,all}', 'none'),
  ('stage.add', 'newcomer', '{none}', 'none'),
  ('stage.edit', 'admin', '{all}', 'all'),
  ('stage.edit', 'head', '{none,all}', 'none'),
  ('stage.edit', 'assistant', '{none,all}', 'none'),
  ('stage.edit', 'coordinator', '{none,all}', 'none'),
  ('stage.edit', 'member', '{none,all}', 'none'),
  ('stage.edit', 'newcomer', '{none}', 'none'),
  ('stage.delete', 'admin', '{all}', 'all'),
  ('stage.delete', 'head', '{none,all}', 'none'),
  ('stage.delete', 'assistant', '{none,all}', 'none'),
  ('stage.delete', 'coordinator', '{none,all}', 'none'),
  ('stage.delete', 'member', '{none,all}', 'none'),
  ('stage.delete', 'newcomer', '{none}', 'none'),
  ('stage.comment', 'admin', '{all}', 'all'),
  ('stage.comment', 'head', '{none,all}', 'none'),
  ('stage.comment', 'assistant', '{none,all}', 'none'),
  ('stage.comment', 'coordinator', '{none,all}', 'none'),
  ('stage.comment', 'member', '{none,all}', 'none'),
  ('stage.comment', 'newcomer', '{none}', 'none'),
  ('stage.templates', 'admin', '{all}', 'all'),
  ('stage.templates', 'head', '{none,all}', 'none'),
  ('stage.templates', 'assistant', '{none,all}', 'none'),
  ('stage.templates', 'coordinator', '{none,all}', 'none'),
  ('stage.templates', 'member', '{none,all}', 'none'),
  ('stage.templates', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- Each team's switches that are on, as grants: everywhere, as they meant.
insert into public.permission_grants (capability, department_id, reach)
select x.capability, a.department_id, 'all'
from public.stage_team_access a
cross join lateral (values
  ('stage.add', a.can_add),
  ('stage.edit', a.can_edit),
  ('stage.delete', a.can_delete),
  ('stage.comment', a.can_comment),
  ('stage.templates', a.can_templates)
) x(capability, given)
where x.given
on conflict do nothing;

create or replace function public.stage_may(uid uuid, priv text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or (priv in ('add', 'edit', 'delete', 'comment', 'templates') and public.may(uid, 'stage.' || priv))
  );
$$;
