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
 * reading it on the right.
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
      'service',
      'my-rota-services',
      'dashboard-service-starts',
      'planner-index-sessions',
      'finished-service-sessions',
      'global-search',
    ],
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
      'service',
    ],
  },
  { table: 'guests', keys: ['guests'] },
  { table: 'set_list_items', keys: ['set-list-items'] },
  { table: 'church_events', keys: ['church-events'] },
  { table: 'service_templates', keys: ['service-templates'] },
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
    ],
  },
  { table: 'rota_release_requests', keys: ['rota-requests'] },
  { table: 'rota_checklist_progress', keys: ['rota-progress', 'dashboard-rosters'] },
  { table: 'checklist_items', keys: ['checklist-items', 'dashboard-rosters'] },
  { table: 'checklists', keys: ['checklist-id', 'checklist-items'] },
  {
    table: 'availability',
    keys: ['availability', 'availability-members', 'dashboard-rosters', 'rota-members'],
  },
  { table: 'attendance', keys: ['dashboard-rosters', 'availability'] },
  { table: 'department_call_times', keys: ['call-times'] },

  /* ---- teams and the people on them ------------------------------- */
  {
    table: 'department_members',
    keys: [
      'department-members',
      'department-members-sensitive',
      'department-core-members',
      'own-memberships',
      'own-departments',
      'volunteer-memberships',
      'rota-members',
      'team-board-roster',
      'dashboard-rosters',
      'volunteers',
    ],
  },
  { table: 'departments', keys: ['departments', 'department', 'own-departments', 'global-search'] },
  { table: 'department_roles', keys: ['department-roles', 'team-coordinator'] },
  { table: 'department_role_checklist_items', keys: ['role-checklist-items'] },
  { table: 'department_role_groups', keys: ['role-groups'] },
  { table: 'team_join_requests', keys: ['join-requests'] },
  {
    // A privilege granted or taken away changes what the page is even
    // allowed to show, so this one matters more than most.
    table: 'user_roles',
    keys: ['user-roles', 'all-user-roles', 'department-grants', 'own-departments', 'volunteers'],
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
  { table: 'app_settings', keys: ['app-settings'] },
  { table: 'announcements', keys: ['announcements-sent', 'pending-alerts'] },
]

/** Every key a change to `table` makes stale. Empty for one we don't watch. */
export function keysFor(table: string): string[] {
  return LIVE_TABLES.find((t) => t.table === table)?.keys ?? []
}
