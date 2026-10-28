/**
 * Which tables are worth watching, and what goes stale when they change.
 *
 * The app fetched everything once, when a page mounted, and then sat
 * still. A head assigning somebody to Camera 2 saw it; the person being
 * assigned did not, until they refreshed or came back to the tab. On a
 * Sunday morning that is the difference between a rota and a rumour: the
 * running order moves, a session is skipped, twenty minutes are granted —
 * and every screen except the one that did it is describing a service
 * that has stopped happening.
 *
 * Four things were already live (the activity feed, the bell, team chat
 * and the board) because each was written with its own subscription. This
 * is the rest of it, said once: table on the left, the queries that were
 * reading it on the right. Since 0202 the activity feed and team chat are
 * here too; only the bell keeps a channel of its own, because it shows the
 * notification itself.
 *
 * Every table here has a `<table>_live` trigger (0202) that says the
 * table changed. `liveTriggers.test.ts` checks the two lists agree.
 *
 * Keys are prefixes. TanStack matches them from the front, so `['rota']`
 * covers `['rota', serviceId]` and every other id under it, which is what
 * makes a list like this maintainable — a new query under an existing
 * prefix is live the day it is written, without touching this file.
 *
 * The mapping is deliberately generous. Invalidating a query nobody is
 * looking at costs nothing: TanStack refetches only what is mounted and
 * marks the rest stale for whenever it is next needed. Missing one costs
 * somebody a wrong answer.
 */

export interface LiveTable {
  table: string
  /** Query key prefixes to invalidate when a row changes. */
  keys: string[]
}

export const LIVE_TABLES: LiveTable[] = [
  /* ---- the Sunday itself ------------------------------------------ */
  {
    table: 'services',
    keys: [
      'services',
      'my-requests',
      'service',
      'my-rota-services',
      'dashboard-service-starts',
      'planner-index-sessions',
      'finished-service-sessions',
      'global-search',
    ],
  },
  {
    // An ask to change an answer after the deadline, and the head's
    // answer to it — two screens that have to agree.
    table: 'availability_change_requests',
    keys: ['availability-requests', 'availability', 'rota'],
  },
  {
    // Who is taking each session. Its own table since a session can be
    // shared, so a name going on one is a row here rather than a change
    // to the session itself.
    table: 'service_session_assignees',
    keys: ['service-sessions', 'rota-service-sessions', 'finished-service-sessions'],
  },
  {
    // The one that moves while people are watching: start it, skip it,
    // grant it ten minutes, and every following session shifts.
    table: 'service_sessions',
    keys: [
      'service-sessions',
      'rota-service-sessions',
      'planner-index-sessions',
      'finished-service-sessions',
      'dashboard-service-starts',
      'availability-service-starts',
      'service',
    ],
  },
  { table: 'guests', keys: ['guests'] },
  { table: 'set_list_items', keys: ['set-list-items'] },
  { table: 'church_events', keys: ['church-events'] },
  { table: 'service_templates', keys: ['service-templates'] },
  { table: 'service_series', keys: ['service-series'] },
  { table: 'service_template_sessions', keys: ['service-templates'] },

  /* ---- who is on, and whether they have done it ------------------- */
  {
    table: 'rota_assignments',
    keys: [
      'rota',
      'rota-assignments',
      'dashboard-rota',
      'dashboard-rosters',
      'my-rota-services',
      'checklist-assignments',
      'rota-progress',
      'service-flow-assignment',
      'team-coordinator',
      'global-search',
      'person-access',
    ],
  },
  { table: 'rota_release_requests', keys: ['rota-requests'] },
  { table: 'rota_checklist_progress', keys: ['rota-progress', 'dashboard-rosters'] },
  { table: 'checklist_items', keys: ['checklist-items', 'dashboard-rosters'] },
  { table: 'checklists', keys: ['checklist-id', 'checklist-items'] },
  {
    table: 'availability',
    keys: ['availability', 'availability-members', 'dashboard-rosters', 'rota-members', 'my-requests'],
  },
  { table: 'attendance', keys: ['dashboard-rosters', 'availability'] },
  { table: 'department_call_times', keys: ['call-times'] },

  /* ---- teams and the people on them ------------------------------- */
  {
    table: 'department_members',
    keys: [
      'department-members',
      'my-requests',
      'department-members-sensitive',
      'department-core-members',
      'own-memberships',
      'team-headcounts',
      'volunteer-memberships',
      'rota-members',
      'team-board-roster',
      'dashboard-rosters',
      'volunteers',
      'person-access',
    ],
  },
  { table: 'departments', keys: ['departments', 'department', 'own-memberships', 'global-search', 'my-requests'] },
  { table: 'department_roles', keys: ['department-roles', 'team-coordinator'] },
  { table: 'department_role_checklist_items', keys: ['role-checklist-items'] },
  { table: 'department_role_groups', keys: ['role-groups'] },
  { table: 'team_join_requests', keys: ['join-requests'] },
  {
    // A privilege granted or taken away changes what the page is even
    // allowed to show, so this one matters more than most.
    table: 'user_roles',
    keys: ['user-roles', 'all-user-roles', 'department-grants', 'own-memberships', 'volunteers', 'person-access'],
  },
  {
    table: 'profiles',
    keys: [
      'volunteers',
      'profile-options',
      'mentionable-people',
      'announcement-people',
      'celebration-people',
      'diary-people',
      'rota-members',
      'global-search',
    ],
  },
  { table: 'invitations', keys: ['invitations'] },
  { table: 'ownership_transfers', keys: ['ownership-transfer'] },

  /* ---- the store cupboard ----------------------------------------- */
  { table: 'inventory_items', keys: ['inventory-items', 'inventory-all', 'scanned-item'] },
  { table: 'inventory_categories', keys: ['inventory-categories'] },
  { table: 'inventory_events', keys: ['inventory-events'] },
  { table: 'inventory_documents', keys: ['inventory-documents'] },
  { table: 'purchase_requests', keys: ['purchase-requests'] },

  /* ---- settings everyone reads ------------------------------------ */
  { table: 'app_settings', keys: ['app-settings', 'nav-layout', 'my-requests'] },
  { table: 'rota_tags', keys: ['rota-tags', 'rota'] },
  { table: 'rota_assignment_tags', keys: ['rota', 'rota-assignments', 'checklist-assignments'] },
  { table: 'service_team_readiness', keys: ['team-readiness'] },
  { table: 'giving_page', keys: ['giving'] },
  { table: 'giving_links', keys: ['giving'] },
  { table: 'giving_bank_accounts', keys: ['giving'] },
  { table: 'announcements', keys: ['announcements-sent', 'pending-alerts'] },
  { table: 'church_updates', keys: ['church-updates'] },
  // Raised, marked done, reopened: the list moves on every phone at once.
  { table: 'service_issues', keys: ['issues'] },
  // Sent, answered, taken back: the Admins' list moves as it happens.
  { table: 'app_feedback', keys: ['feedback'] },
  /* ---- clock in (0191–0194, published in 0199) ---------------------- */
  // A clock-in lands, is put right or approved: the page, the Dashboard's
  // button and its "still to arrive" move on every screen at once.
  {
    table: 'clock_ins',
    keys: ['clock-ins', 'clock-in-teams', 'clock-in-still-out', 'my-clock-in', 'availability', 'dashboard-rosters'],
  },
  { table: 'clock_in_history', keys: ['clock-in-history'] },
  { table: 'clock_in_requests', keys: ['clock-in-requests', 'my-clock-in', 'clock-in-still-out'] },
  { table: 'clock_in_place', keys: ['clock-in-place', 'my-clock-in'] },
  // Prayer's tables are not here: nobody may read them row by row, so they
  // are live by a broadcast of their own (lib/usePrayerLive, 0199).
  /* ---- the stage (0155) ---------------------------------------------- */
  { table: 'stage_layouts', keys: ['stage'] },
  { table: 'stage_blocks', keys: ['stage'] },
  { table: 'stage_comments', keys: ['stage'] },
  { table: 'stage_layout_log', keys: ['stage'] },
  { table: 'stage_templates', keys: ['stage'] },
  { table: 'stage_template_requests', keys: ['stage'] },
  { table: 'stage_team_access', keys: ['stage'] },
  { table: 'stage_areas', keys: ['stage'] },
  { table: 'stage_move_requests', keys: ['stage'] },
  // A poll, its options and every answer: the bars move as people vote.
  { table: 'team_polls', keys: ['polls', 'my-requests'] },
  { table: 'team_poll_options', keys: ['polls'] },
  { table: 'team_poll_votes', keys: ['polls', 'my-requests'] },

  /* ---- guests on a team, and what they answered (0166, 0167) ------ */
  {
    table: 'department_guests',
    keys: ['department-guests', 'rota-team-guests', 'availability-team-guests', 'rota', 'availability', 'global-search'],
  },
  { table: 'guest_availability', keys: ['availability', 'rota', 'dashboard-rosters'] },
  { table: 'guest_availability_history', keys: ['availability'] },
  {
    table: 'guest_rota_assignments',
    keys: ['rota', 'rota-assignments', 'dashboard-rota', 'dashboard-rosters', 'checklist-assignments', 'rota-progress'],
  },
  { table: 'availability_history', keys: ['availability'] },

  /* ---- families, the permission grid, the tour (0149, 0162, 0153) -- */
  { table: 'households', keys: ['family'] },
  // Two people in one household, married: the Dashboard's anniversaries.
  { table: 'household_members', keys: ['family', 'married-couples'] },
  { table: 'family_link_requests', keys: ['family'] },
  // A rule changed in Settings reaches every open page: what a Head may
  // do, and what a page even shows, follows the grid.
  { table: 'role_permissions', keys: ['role-permissions'] },
  { table: 'department_permissions', keys: ['role-permissions'] },
  { table: 'permission_grants', keys: ['role-permissions', 'person-access', 'stage'] },
  { table: 'onboarding', keys: ['onboarding', 'onboarding-people'] },

  /* ---- the message board and debriefs ------------------------------ */
  // Both were in the publication all along; nothing on screen was
  // listening, so a post or a debrief item showed up only on a reload.
  { table: 'messages', keys: ['messages', 'global-search'] },
  { table: 'service_debriefs', keys: ['service-debriefs'] },
  { table: 'service_debrief_items', keys: ['service-debriefs'] },

  /* ---- the Dashboard's reminders ----------------------------------- */
  // my_open_requests (0183) reads the tables above that carry
  // 'my-requests', and this one. The bell keeps its own channel for new
  // notifications; this is for the reminder that goes when one is read or
  // answered.
  { table: 'notifications', keys: ['my-requests'] },

  /* ---- the activity feed and team chat ------------------------------ */
  // Each had its own subscription, filtered to one service or one team.
  // The broadcast says only which table moved (0202), so every open feed
  // and room checks itself; each is one small query.
  { table: 'activity', keys: ['activity'] },
  { table: 'team_messages', keys: ['team-messages'] },
]

/** Every key a change to `table` makes stale. Empty for one we don't watch. */
export function keysFor(table: string): string[] {
  return LIVE_TABLES.find((t) => t.table === table)?.keys ?? []
}
