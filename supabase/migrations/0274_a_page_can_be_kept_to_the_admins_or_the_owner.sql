/*
 * A page can be kept to the Admins, or to the Owner.
 *
 * Who may open a page is a row in the grid (0215), but three of its cells
 * were fixed at Yes: an Admin's, a Team Head's and an Assisting Head's.
 * So a page could be kept to "Team Heads and Admins" and no further, and
 * can_open_page() let an Admin in before it asked the grid at all. The
 * Owner asked for those to be switches too (November 2026).
 *
 * - On the nine pages that can already be kept to Heads (the ones whose
 *   Team Member cell is a choice), the Admin, Team Head and Assisting Head
 *   cells become a choice: No or Everywhere. Each starts at Everywhere,
 *   where it was fixed, so nothing changes for anybody until one is
 *   changed. The pages a Team Member always opens (Team Rota, Polls,
 *   Teams, Prayer Requests) stay as they are: closing them to Heads alone
 *   would not do what the cell says.
 * - can_open_page() no longer passes an Admin before asking: for a page
 *   in the grid it asks may(), which reads the Admin's cell like any
 *   other. For a page not in the grid, an Admin still opens it.
 * - Access & Privileges is not a page in this sense — it opens by
 *   app.permissions, which stays fixed for every Admin — so an Admin can
 *   always put a page back.
 * - A team cannot set these for itself: the cells offer no "Their team".
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('page.service_planner', 'admin', '{none,all}', 'all'),
  ('page.service_planner', 'head', '{none,all}', 'all'),
  ('page.service_planner', 'assistant', '{none,all}', 'all'),
  ('page.set_lists', 'admin', '{none,all}', 'all'),
  ('page.set_lists', 'head', '{none,all}', 'all'),
  ('page.set_lists', 'assistant', '{none,all}', 'all'),
  ('page.debriefs', 'admin', '{none,all}', 'all'),
  ('page.debriefs', 'head', '{none,all}', 'all'),
  ('page.debriefs', 'assistant', '{none,all}', 'all'),
  ('page.messages', 'admin', '{none,all}', 'all'),
  ('page.messages', 'head', '{none,all}', 'all'),
  ('page.messages', 'assistant', '{none,all}', 'all'),
  ('page.updates', 'admin', '{none,all}', 'all'),
  ('page.updates', 'head', '{none,all}', 'all'),
  ('page.updates', 'assistant', '{none,all}', 'all'),
  ('page.events', 'admin', '{none,all}', 'all'),
  ('page.events', 'head', '{none,all}', 'all'),
  ('page.events', 'assistant', '{none,all}', 'all'),
  ('page.giving', 'admin', '{none,all}', 'all'),
  ('page.giving', 'head', '{none,all}', 'all'),
  ('page.giving', 'assistant', '{none,all}', 'all'),
  ('page.stage', 'admin', '{none,all}', 'all'),
  ('page.stage', 'head', '{none,all}', 'all'),
  ('page.stage', 'assistant', '{none,all}', 'all'),
  ('page.inventory', 'admin', '{none,all}', 'all'),
  ('page.inventory', 'head', '{none,all}', 'all'),
  ('page.inventory', 'assistant', '{none,all}', 'all')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

create or replace function public.can_open_page(uid uuid, page text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select uid is not null and (
    public.overwatch_sees(uid, page)
    or case
      when exists (
        select 1 from public.permission_catalog c where c.capability = 'page.' || replace(page, '-', '_')
      ) then public.may(uid, 'page.' || replace(page, '-', '_'))
      else public.is_admin(uid) or case public.page_level(page)
        when 'everyone' then true
        when 'team'     then public.is_on_a_team(uid)
        when 'leads'    then public.is_a_lead(uid)
        else false
      end
    end
  );
$$;

notify pgrst, 'reload schema';
