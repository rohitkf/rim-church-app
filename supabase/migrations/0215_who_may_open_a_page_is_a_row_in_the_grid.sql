/*
 * Who may open a page is a row in the grid.
 *
 * Settings › Page by Page sets each page to a level — everyone signed in,
 * anyone on a team, Team Heads and Admins — kept in app_settings.page_access
 * (0123) and read by can_open_page(), which twenty-two read rules and eight
 * functions ask. A level is not a cell, so nobody could be let into one
 * page by name, and the grid could not say who opens what. Now each page
 * with a choice is a capability, `page.<page>`, and its level is cells:
 *
 *   Admin, Team Head, Assisting Head   yes, always — every level lets them in
 *   Team Member                        yes, unless the page is for Heads
 *   Church Member                      yes, if the page is for everyone
 *   Team Coordinator                   no — a Coordinator opens a page as
 *                                      the Team Member they are, as before
 *
 * A cell is offered only where the page offers the level: the Rota cannot
 * be closed to Team Members, nor Debriefs opened to Church Members. Every
 * pair of cells is one of the old levels, so Page by Page still offers the
 * levels and writes the cells.
 *
 * can_open_page() asks may() for these pages, which also counts a grant
 * (0208): a page can now be opened to one person, or to everybody on a
 * team, whatever its level. Admins, the Owner and Overwatch's own pages
 * are as before. A page with no choice — the Dashboard, Availability,
 * Clock In and the like — keeps its fixed rule.
 *
 * The church's levels are carried over as cells. Checked on production
 * before applying, for every person and every page, at every level each
 * page offers: can_open_page() answers as before.
 *
 * app_settings.page_access stays, read by nothing for these pages, until
 * a later release drops it; the app stops writing it with this one.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('page.service_planner', 'admin', '{all}', 'all'),
  ('page.service_planner', 'head', '{all}', 'all'),
  ('page.service_planner', 'assistant', '{all}', 'all'),
  ('page.service_planner', 'coordinator', '{none}', 'none'),
  ('page.service_planner', 'member', '{none,all}', 'all'),
  ('page.service_planner', 'newcomer', '{none,all}', 'all'),
  ('page.rota', 'admin', '{all}', 'all'),
  ('page.rota', 'head', '{all}', 'all'),
  ('page.rota', 'assistant', '{all}', 'all'),
  ('page.rota', 'coordinator', '{none}', 'none'),
  ('page.rota', 'member', '{all}', 'all'),
  ('page.rota', 'newcomer', '{none,all}', 'none'),
  ('page.set_lists', 'admin', '{all}', 'all'),
  ('page.set_lists', 'head', '{all}', 'all'),
  ('page.set_lists', 'assistant', '{all}', 'all'),
  ('page.set_lists', 'coordinator', '{none}', 'none'),
  ('page.set_lists', 'member', '{none,all}', 'all'),
  ('page.set_lists', 'newcomer', '{none,all}', 'all'),
  ('page.debriefs', 'admin', '{all}', 'all'),
  ('page.debriefs', 'head', '{all}', 'all'),
  ('page.debriefs', 'assistant', '{all}', 'all'),
  ('page.debriefs', 'coordinator', '{none}', 'none'),
  ('page.debriefs', 'member', '{none,all}', 'all'),
  ('page.debriefs', 'newcomer', '{none}', 'none'),
  ('page.messages', 'admin', '{all}', 'all'),
  ('page.messages', 'head', '{all}', 'all'),
  ('page.messages', 'assistant', '{all}', 'all'),
  ('page.messages', 'coordinator', '{none}', 'none'),
  ('page.messages', 'member', '{none,all}', 'all'),
  ('page.messages', 'newcomer', '{none,all}', 'none'),
  ('page.updates', 'admin', '{all}', 'all'),
  ('page.updates', 'head', '{all}', 'all'),
  ('page.updates', 'assistant', '{all}', 'all'),
  ('page.updates', 'coordinator', '{none}', 'none'),
  ('page.updates', 'member', '{none,all}', 'all'),
  ('page.updates', 'newcomer', '{none,all}', 'all'),
  ('page.polls', 'admin', '{all}', 'all'),
  ('page.polls', 'head', '{all}', 'all'),
  ('page.polls', 'assistant', '{all}', 'all'),
  ('page.polls', 'coordinator', '{none}', 'none'),
  ('page.polls', 'member', '{all}', 'all'),
  ('page.polls', 'newcomer', '{none,all}', 'all'),
  ('page.events', 'admin', '{all}', 'all'),
  ('page.events', 'head', '{all}', 'all'),
  ('page.events', 'assistant', '{all}', 'all'),
  ('page.events', 'coordinator', '{none}', 'none'),
  ('page.events', 'member', '{none,all}', 'all'),
  ('page.events', 'newcomer', '{none,all}', 'all'),
  ('page.giving', 'admin', '{all}', 'all'),
  ('page.giving', 'head', '{all}', 'all'),
  ('page.giving', 'assistant', '{all}', 'all'),
  ('page.giving', 'coordinator', '{none}', 'none'),
  ('page.giving', 'member', '{none,all}', 'all'),
  ('page.giving', 'newcomer', '{none,all}', 'all'),
  ('page.departments', 'admin', '{all}', 'all'),
  ('page.departments', 'head', '{all}', 'all'),
  ('page.departments', 'assistant', '{all}', 'all'),
  ('page.departments', 'coordinator', '{none}', 'none'),
  ('page.departments', 'member', '{all}', 'all'),
  ('page.departments', 'newcomer', '{none,all}', 'none'),
  ('page.prayer', 'admin', '{all}', 'all'),
  ('page.prayer', 'head', '{all}', 'all'),
  ('page.prayer', 'assistant', '{all}', 'all'),
  ('page.prayer', 'coordinator', '{none}', 'none'),
  ('page.prayer', 'member', '{all}', 'all'),
  ('page.prayer', 'newcomer', '{none,all}', 'all'),
  ('page.stage', 'admin', '{all}', 'all'),
  ('page.stage', 'head', '{all}', 'all'),
  ('page.stage', 'assistant', '{all}', 'all'),
  ('page.stage', 'coordinator', '{none}', 'none'),
  ('page.stage', 'member', '{none,all}', 'all'),
  ('page.stage', 'newcomer', '{none,all}', 'all'),
  ('page.inventory', 'admin', '{all}', 'all'),
  ('page.inventory', 'head', '{all}', 'all'),
  ('page.inventory', 'assistant', '{all}', 'all'),
  ('page.inventory', 'coordinator', '{none}', 'none'),
  ('page.inventory', 'member', '{none,all}', 'all'),
  ('page.inventory', 'newcomer', '{none}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

-- The church's levels, as the cells that differ from each page's default.
insert into public.role_permissions (role_key, capability, reach)
select c.role_key, c.capability, v.reach
from public.app_settings s
cross join lateral jsonb_each_text(coalesce(s.page_access, '{}'::jsonb)) a(page, level)
cross join lateral (values
  ('newcomer', case a.level when 'everyone' then 'all' else 'none' end),
  ('member', case a.level when 'leads' then 'none' else 'all' end)
) v(role_key, reach)
join public.permission_catalog c
  on c.capability = 'page.' || replace(a.page, '-', '_') and c.role_key = v.role_key
where a.level in ('everyone', 'team', 'leads')
  and cardinality(c.reaches) > 1
  and v.reach = any (c.reaches)
  and v.reach <> c.default_reach
on conflict (role_key, capability) do update set reach = excluded.reach;

create or replace function public.can_open_page(uid uuid, page text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.is_admin(uid)
    or public.overwatch_sees(uid, page)
    or case
      when exists (
        select 1 from public.permission_catalog c where c.capability = 'page.' || replace(page, '-', '_')
      ) then public.may(uid, 'page.' || replace(page, '-', '_'))
      else case public.page_level(page)
        when 'everyone' then true
        when 'team'     then public.is_on_a_team(uid)
        when 'leads'    then public.is_a_lead(uid)
        else false
      end
    end
  );
$$;
