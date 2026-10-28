/*
 * Drop the settings the grid replaced.
 *
 * Thirteen app_settings columns, and one table, have been read by nothing
 * since their rules became the grid's, and the app stopped asking for the
 * columns a release ago:
 *
 *   clock_in_viewers, clock_in_approver_teams,   clockin.view, clockin.approve
 *   clock_in_approvers                           (0209, 0213)
 *   prayer_carers, prayer_assigners,             prayer.* (0210)
 *   prayer_list_runners
 *   planner_controls                             planner.* (0211)
 *   stage_team_access (a table, empty)           stage.* (0212)
 *   overwatch_board_posts, _chat_posts, _polls,  Overwatch's cells (0214)
 *   _issues, _debriefs
 *   page_access                                  the page.* rows (0215)
 *
 * Their check constraints go with them, and so do the two validators
 * nothing else asks, page_access_is_valid() and planner_controls_is_valid().
 * clock_in_audience_is_valid() stays: prayer lists still use it.
 *
 * page_level() read page_access; it is asked now only for the pages with
 * no choice, which were never in page_access, so it keeps its defaults
 * and stops reading the column. Checked on production before applying:
 * can_open_page() answers as before for every person and page, and the
 * settings the app asks for still load.
 */

create or replace function public.page_level(page text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case page
    when 'service-planner' then 'everyone'
    when 'set-lists'       then 'everyone'
    when 'updates'         then 'everyone'
    when 'polls'           then 'everyone'
    when 'events'          then 'everyone'
    when 'giving'          then 'everyone'
    when 'stage'           then 'everyone'
    when 'prayer'          then 'everyone'
    -- Teams, from here on, is for people on a team.
    else 'team'
  end;
$$;

alter table public.app_settings
  drop column page_access,
  drop column planner_controls,
  drop column overwatch_board_posts,
  drop column overwatch_chat_posts,
  drop column overwatch_polls,
  drop column overwatch_issues,
  drop column overwatch_debriefs,
  drop column clock_in_viewers,
  drop column clock_in_approver_teams,
  drop column clock_in_approvers,
  drop column prayer_carers,
  drop column prayer_assigners,
  drop column prayer_list_runners;

drop table public.stage_team_access;

drop function public.page_access_is_valid(jsonb);
drop function public.planner_controls_is_valid(jsonb);
