/*
 * A church member reads what a church member sees.
 *
 * Somebody signed in and on no team is a church member: they see the
 * services, the diary, the set lists, the teams (to ask to join one) and
 * the Giving page. Everything a team works with is closed to them — the
 * rota since 0080, and the pages that show it.
 *
 * Two tables had been left open to anybody signed in, so a church member
 * could read through the API what no page shows them:
 *
 *   activity               "Joel assigned · Technical Director" — the
 *                          rota, a line at a time, which 0080 closed
 *                          everywhere else;
 *   service_debriefs,      what a team said about a Sunday afterwards —
 *   service_debrief_items  a team's working notes, whose page the app
 *                          already offers only to people on a team.
 *
 * Both now read as the rota does: anybody on a team (or over them all,
 * which is_on_a_team already counts). Who can write either is unchanged.
 */

drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select using (public.is_on_a_team(auth.uid()));

drop policy if exists service_debriefs_select on public.service_debriefs;
create policy service_debriefs_select on public.service_debriefs
  for select using (public.is_on_a_team(auth.uid()));

drop policy if exists service_debrief_items_select on public.service_debrief_items;
create policy service_debrief_items_select on public.service_debrief_items
  for select using (public.is_on_a_team(auth.uid()));
