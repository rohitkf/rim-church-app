/*
 * A Pastor has a cell on every row of the grid (asked for by the Owner,
 * November 2026: "I don't want to see — for anyone; I should always have
 * the option").
 *
 * Until now the Pastor's column was the three prayer rows and nothing
 * else (0214): every other cell was a fixed No, drawn as a dash, and what
 * else a Pastor might do had to come from another profile or a grant by
 * name. 0267 gave the column its registrations rows; this gives it the
 * rest — every capability, No out of the box, No or Everywhere as the
 * church chooses.
 *
 * Nothing changes for anybody until a cell is changed: each new cell
 * starts at No, and may() already reads a Pastor's cell wherever the
 * catalog has one (0214), so no function is touched.
 *
 * Four rows stay without a Pastor's cell, on purpose:
 *   app.permissions                          the grid itself: an Admin's alone
 *   issue.as_overwatch, debrief.as_overwatch done as Overwatch, nobody else's
 *   page.prayer                              a Pastor always opens Prayer Requests
 * and the three prayer rows stay fixed at Everywhere, as 0214 left them.
 */

insert into public.permission_catalog (capability, role_key, reaches, default_reach) values
  ('rota.assign', 'pastor', '{none,all}', 'none'),
  ('rota.tag', 'pastor', '{none,all}', 'none'),
  ('rota.release_ask', 'pastor', '{none,all}', 'none'),
  ('rota.release_decide', 'pastor', '{none,all}', 'none'),
  ('rota.release_delete', 'pastor', '{none,all}', 'none'),
  ('svc.manage', 'pastor', '{none,all}', 'none'),
  ('svc.templates', 'pastor', '{none,all}', 'none'),
  ('svc.sessions', 'pastor', '{none,all}', 'none'),
  ('svc.guests', 'pastor', '{none,all}', 'none'),
  ('svc.repeat', 'pastor', '{none,all}', 'none'),
  ('svc.events', 'pastor', '{none,all}', 'none'),
  ('svc.call_times', 'pastor', '{none,all}', 'none'),
  ('team.create', 'pastor', '{none,all}', 'none'),
  ('team.edit', 'pastor', '{none,all}', 'none'),
  ('clockin.approve', 'pastor', '{none,all}', 'none'),
  ('clockin.view', 'pastor', '{none,all}', 'none'),
  ('planner.start', 'pastor', '{none,all}', 'none'),
  ('planner.hold', 'pastor', '{none,all}', 'none'),
  ('planner.add_time', 'pastor', '{none,all}', 'none'),
  ('planner.skip', 'pastor', '{none,all}', 'none'),
  ('planner.substitute', 'pastor', '{none,all}', 'none'),
  ('planner.add_below', 'pastor', '{none,all}', 'none'),
  ('planner.remove', 'pastor', '{none,all}', 'none'),
  ('planner.end', 'pastor', '{none,all}', 'none'),
  ('stage.add', 'pastor', '{none,all}', 'none'),
  ('stage.edit', 'pastor', '{none,all}', 'none'),
  ('stage.delete', 'pastor', '{none,all}', 'none'),
  ('stage.comment', 'pastor', '{none,all}', 'none'),
  ('stage.templates', 'pastor', '{none,all}', 'none'),
  ('team.request_join', 'pastor', '{none,all}', 'none'),
  ('team.members', 'pastor', '{none,all}', 'none'),
  ('team.roles', 'pastor', '{none,all}', 'none'),
  ('team.groups', 'pastor', '{none,all}', 'none'),
  ('team.checklists', 'pastor', '{none,all}', 'none'),
  ('team.join', 'pastor', '{none,all}', 'none'),
  ('day.verify', 'pastor', '{none,all}', 'none'),
  ('day.check_all', 'pastor', '{none,all}', 'none'),
  ('day.ready', 'pastor', '{none,all}', 'none'),
  ('day.attendance', 'pastor', '{none,all}', 'none'),
  ('day.nudge', 'pastor', '{none,all}', 'none'),
  ('avail.edit_others', 'pastor', '{none,all}', 'none'),
  ('avail.add_others', 'pastor', '{none,all}', 'none'),
  ('avail.late_decide', 'pastor', '{none,all}', 'none'),
  ('avail.nudge', 'pastor', '{none,all}', 'none'),
  ('avail.history', 'pastor', '{none,all}', 'none'),
  ('inv.items', 'pastor', '{none,all}', 'none'),
  ('inv.stock', 'pastor', '{none,all}', 'none'),
  ('inv.purchase_ask', 'pastor', '{none,all}', 'none'),
  ('inv.purchase_decide', 'pastor', '{none,all}', 'none'),
  ('msg.board_post', 'pastor', '{none,all}', 'none'),
  ('msg.board_moderate', 'pastor', '{none,all}', 'none'),
  ('msg.chat', 'pastor', '{none,all}', 'none'),
  ('msg.chat_moderate', 'pastor', '{none,all}', 'none'),
  ('msg.polls', 'pastor', '{none,all}', 'none'),
  ('msg.updates', 'pastor', '{none,all}', 'none'),
  ('msg.alert_team', 'pastor', '{none,all}', 'none'),
  ('msg.alert', 'pastor', '{none,all}', 'none'),
  ('issue.mark', 'pastor', '{none,all}', 'none'),
  ('issue.delete', 'pastor', '{none,all}', 'none'),
  ('songs.edit', 'pastor', '{none,all}', 'none'),
  ('countdown.view', 'pastor', '{none,all}', 'none'),
  ('set.edit', 'pastor', '{none,all}', 'none'),
  ('debrief.manage', 'pastor', '{none,all}', 'none'),
  ('debrief.contribute', 'pastor', '{none,all}', 'none'),
  ('give.edit', 'pastor', '{none,all}', 'none'),
  ('people.edit_others', 'pastor', '{none,all}', 'none'),
  ('people.invite', 'pastor', '{none,all}', 'none'),
  ('people.clear_records', 'pastor', '{none,all}', 'none'),
  ('people.onboard', 'pastor', '{none,all}', 'none'),
  ('people.ages', 'pastor', '{none,all}', 'none'),
  ('people.remove', 'pastor', '{none,all}', 'none'),
  ('page.service_planner', 'pastor', '{none,all}', 'none'),
  ('page.rota', 'pastor', '{none,all}', 'none'),
  ('page.set_lists', 'pastor', '{none,all}', 'none'),
  ('page.debriefs', 'pastor', '{none,all}', 'none'),
  ('page.messages', 'pastor', '{none,all}', 'none'),
  ('page.updates', 'pastor', '{none,all}', 'none'),
  ('page.polls', 'pastor', '{none,all}', 'none'),
  ('page.events', 'pastor', '{none,all}', 'none'),
  ('page.giving', 'pastor', '{none,all}', 'none'),
  ('page.departments', 'pastor', '{none,all}', 'none'),
  ('page.stage', 'pastor', '{none,all}', 'none'),
  ('page.inventory', 'pastor', '{none,all}', 'none')
on conflict (capability, role_key) do update
  set reaches = excluded.reaches, default_reach = excluded.default_reach;

notify pgrst, 'reload schema';
