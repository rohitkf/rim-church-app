/**
 * The permissions the church sets for itself, and the question every
 * button asks of them.
 *
 * The database holds the same catalog (`permission_catalog`, from 0133) and
 * enforces it: every converted policy asks `may()`. This copy exists so
 * the grid and the buttons draw at once, without waiting on a request, and
 * `permissionCatalog.test.ts` reads the migrations to keep the two the
 * same. What the church changed — and only that — comes from
 * `role_permissions`.
 *
 * `decide()` mirrors `may()` line for line. It only decides whether a
 * button is worth drawing; the database is the one that holds.
 */

/** How far a permission reaches. Each includes the one before it. */
export type Reach = 'none' | 'own' | 'team' | 'all'

/** The profiles a permission is given to. The Owner is not one: it holds everything. */
export type GrantRole = 'admin' | 'head' | 'assistant' | 'coordinator' | 'member' | 'newcomer'

export const GRANT_ROLES: readonly GrantRole[] = ['admin', 'head', 'assistant', 'coordinator', 'member', 'newcomer']

/**
 * The profiles a team can set its own rules for (0162): the ones whose
 * "team" is a particular team. An Admin's reach is the church's; a Church
 * Member is everybody.
 */
export const TEAM_ROLES: readonly GrantRole[] = ['head', 'assistant', 'coordinator', 'member']

export interface Rule {
  /** What this profile can be given, narrowest first. One means fixed. */
  reaches: readonly Reach[]
  /** What it has out of the box. */
  byDefault: Reach
}

export const REACHES: readonly Reach[] = ['none', 'own', 'team', 'all']

export const REACH_LABEL: Record<Reach, string> = {
  none: 'No',
  own: 'Their own',
  team: 'Their team',
  all: 'Everywhere',
}

/** The same, short enough for six columns side by side. */
export const REACH_SHORT: Record<Reach, string> = {
  none: 'No',
  own: 'Own',
  team: 'Team',
  all: 'All',
}

const offer = (reaches: string, byDefault: Reach): Rule => ({
  reaches: reaches.split(' ') as Reach[],
  byDefault,
})
const fixed = (reach: Reach = 'none'): Rule => ({ reaches: [reach], byDefault: reach })

/*
 * One entry per capability, five profiles each — the same as the
 * migration's insert, cell for cell. A new area's capabilities arrive here
 * in the same release as the migration that adds them to the catalog and
 * the policies that read them.
 */
export const CATALOG = {
  'app.permissions': {
    admin: fixed('all'),
    head: fixed(),
    assistant: fixed(),
    coordinator: fixed(),
    member: fixed(),
    newcomer: fixed(),
  },
  'rota.assign': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'rota.tag': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'rota.release_ask': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team', 'none'),
    newcomer: fixed(),
  },
  'rota.release_decide': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team', 'none'),
    newcomer: fixed(),
  },
  'rota.release_delete': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: fixed(),
    member: fixed(),
    newcomer: fixed(),
  },
  'svc.manage': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'svc.templates': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'svc.sessions': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'svc.guests': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'svc.repeat': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'svc.events': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'svc.call_times': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'team.create': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'team.edit': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  // Asking to join a team (0190): out of the box a Church Member is added
  // by a head rather than asking.
  'team.request_join': {
    admin: fixed(),
    head: offer('none all', 'all'),
    assistant: offer('none all', 'all'),
    coordinator: fixed(),
    member: offer('none all', 'all'),
    newcomer: offer('none all', 'none'),
  },
  'team.members': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'team.roles': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'team.groups': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'team.checklists': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'team.join': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'day.verify': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'team'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'day.ready': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'team'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'day.attendance': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'day.nudge': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'avail.edit_others': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'avail.add_others': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'avail.late_decide': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'avail.nudge': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'avail.history': {
    admin: offer('none all', 'all'),
    head: offer('none own team all', 'team'),
    assistant: offer('none own team all', 'team'),
    coordinator: fixed(),
    member: offer('none own team all', 'none'),
    newcomer: fixed(),
  },
  'inv.items': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'inv.stock': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'inv.purchase_ask': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'team'),
    newcomer: fixed(),
  },
  'inv.purchase_decide': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'msg.board_post': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'team'),
    newcomer: fixed(),
  },
  'msg.board_moderate': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'msg.chat': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'team'),
    newcomer: fixed(),
  },
  'msg.chat_moderate': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'msg.polls': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'msg.updates': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'msg.alert_team': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'msg.alert': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'issue.mark': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'issue.delete': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'set.edit': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: fixed(),
    member: offer('none team all', 'team'),
    newcomer: fixed(),
  },
  'debrief.manage': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'debrief.contribute': {
    admin: offer('none all', 'none'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: offer('none team', 'none'),
    member: offer('none team all', 'team'),
    newcomer: fixed(),
  },
  'give.edit': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'people.edit_others': {
    admin: offer('none all', 'all'),
    head: fixed(),
    assistant: fixed(),
    coordinator: fixed(),
    member: fixed(),
    newcomer: fixed(),
  },
  'people.invite': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    assistant: offer('none team all', 'team'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'people.clear_records': {
    admin: offer('none all', 'all'),
    head: offer('none all', 'none'),
    assistant: offer('none all', 'none'),
    coordinator: fixed(),
    member: offer('none all', 'none'),
    newcomer: fixed(),
  },
  'people.onboard': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
    assistant: offer('none team all', 'none'),
    coordinator: fixed(),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'people.remove': {
    admin: offer('none all', 'all'),
    head: fixed(),
    assistant: fixed(),
    coordinator: fixed(),
    member: fixed(),
    newcomer: fixed(),
  },
} as const satisfies Record<string, Record<GrantRole, Rule>>

export type CapabilityKey = keyof typeof CATALOG

export const CAPABILITY_KEYS = Object.keys(CATALOG) as CapabilityKey[]

export function isCapabilityKey(value: string): value is CapabilityKey {
  return Object.prototype.hasOwnProperty.call(CATALOG, value)
}

export function ruleFor(cap: CapabilityKey, role: GrantRole): Rule {
  return CATALOG[cap][role]
}

export function isFixed(cap: CapabilityKey, role: GrantRole): boolean {
  return ruleFor(cap, role).reaches.length === 1
}

/** The church's changes, cell by cell. A cell it never touched is absent. */
export type Overrides = Partial<Record<CapabilityKey, Partial<Record<GrantRole, Reach>>>>

/**
 * One team's own rules (0162), by team id: the cells it set differently
 * from the church. A cell a team never set follows the church's.
 */
export type TeamOverrides = Record<string, Overrides>

/**
 * The reach in force: the church's choice if it is still on offer,
 * otherwise the default. The same order `permission_reach()` uses.
 */
export function reachOf(overrides: Overrides, cap: CapabilityKey, role: GrantRole): Reach {
  const rule = ruleFor(cap, role)
  const chosen = overrides[cap]?.[role]
  return chosen && rule.reaches.includes(chosen) ? chosen : rule.byDefault
}

/** The reaches a team may set for this profile: the catalog's, no wider than the team. */
export function teamReaches(cap: CapabilityKey, role: GrantRole): readonly Reach[] {
  if (!TEAM_ROLES.includes(role)) return []
  const rule = ruleFor(cap, role)
  if (!rule.reaches.includes('team')) return []
  return rule.reaches.filter((r) => r !== 'all')
}

/** Whether a team can set this cell for itself at all. */
export function isTeamSettable(cap: CapabilityKey, role: GrantRole): boolean {
  return teamReaches(cap, role).length > 1
}

/** What this team set for the cell, if it set anything the catalog still offers. */
export function teamChoice(teams: TeamOverrides, dept: string | null | undefined, cap: CapabilityKey, role: GrantRole): Reach | null {
  if (!dept) return null
  const chosen = teams[dept]?.[cap]?.[role]
  return chosen && teamReaches(cap, role).includes(chosen) ? chosen : null
}

/**
 * The reach in force on one team: the team's own rule where it made one,
 * otherwise the church's. The same order `permission_reach(role, cap, dept)`
 * uses.
 */
export function reachOn(
  overrides: Overrides,
  teams: TeamOverrides,
  dept: string | null | undefined,
  cap: CapabilityKey,
  role: GrantRole,
): Reach {
  return teamChoice(teams, dept, cap, role) ?? reachOf(overrides, cap, role)
}

/** Rows from `role_permissions`, as the overrides they are. Unknown rows are ignored. */
export function overridesFrom(rows: { role_key: string; capability: string; reach: string }[]): Overrides {
  const out: Overrides = {}
  for (const row of rows) {
    if (!isCapabilityKey(row.capability)) continue
    if (!(GRANT_ROLES as readonly string[]).includes(row.role_key)) continue
    if (!(REACHES as readonly string[]).includes(row.reach)) continue
    out[row.capability] = { ...out[row.capability], [row.role_key as GrantRole]: row.reach as Reach }
  }
  return out
}

/** Rows from `department_permissions`, as the teams' own rules. Unknown rows are ignored. */
export function teamOverridesFrom(
  rows: { department_id: string; role_key: string; capability: string; reach: string }[],
): TeamOverrides {
  const out: TeamOverrides = {}
  for (const row of rows) {
    if (!isCapabilityKey(row.capability)) continue
    if (!(GRANT_ROLES as readonly string[]).includes(row.role_key)) continue
    if (!(REACHES as readonly string[]).includes(row.reach)) continue
    const team = out[row.department_id] ?? {}
    team[row.capability] = { ...team[row.capability], [row.role_key as GrantRole]: row.reach as Reach }
    out[row.department_id] = team
  }
  return out
}

/**
 * One cell, as `set_permissions()` takes it. With a `department` it is
 * that team's own rule; `reach: null` there means "as the church".
 */
export interface PermissionChange {
  role: GrantRole
  capability: CapabilityKey
  reach: Reach | null
  department?: string | null
}

/**
 * What saving `next` over `stored` has to send: every cell whose reach in
 * force would change. Fixed cells never appear — there is nothing to send.
 */
export function changesBetween(stored: Overrides, next: Overrides): PermissionChange[] {
  const out: PermissionChange[] = []
  for (const capability of CAPABILITY_KEYS) {
    for (const role of GRANT_ROLES) {
      if (isFixed(capability, role)) continue
      const before = reachOf(stored, capability, role)
      const after = reachOf(next, capability, role)
      if (before !== after) out.push({ role, capability, reach: after })
    }
  }
  return out
}

/**
 * What saving `next` over `stored` has to send for the teams' own rules:
 * every team cell whose choice would change, including one being given
 * up (sent as null).
 */
export function teamChangesBetween(stored: TeamOverrides, next: TeamOverrides): PermissionChange[] {
  const out: PermissionChange[] = []
  for (const department of new Set([...Object.keys(stored), ...Object.keys(next)])) {
    for (const capability of CAPABILITY_KEYS) {
      for (const role of TEAM_ROLES) {
        if (!isTeamSettable(capability, role)) continue
        const before = teamChoice(stored, department, capability, role)
        const after = teamChoice(next, department, capability, role)
        if (before !== after) out.push({ role, capability, reach: after, department })
      }
    }
  }
  return out
}

/** Every changeable cell back at the app's default — a draft, until saved. */
export function defaultsOver(stored: Overrides): Overrides {
  const out: Overrides = {}
  for (const capability of CAPABILITY_KEYS) {
    for (const role of GRANT_ROLES) {
      if (stored[capability]?.[role] !== undefined) {
        out[capability] = { ...out[capability], [role]: ruleFor(capability, role).byDefault }
      }
    }
  }
  return out
}

/** Who somebody is, as far as permissions go. */
export interface Holder {
  myId: string | null
  owner: boolean
  admin: boolean
  /** Teams they head or assist. */
  ledTeams: readonly string[]
  /** Teams they head, as Head. Left out, every led team counts as headed. */
  headTeams?: readonly string[]
  /** Teams they assist, as Assisting Head (0162). Left out, none. */
  assistTeams?: readonly string[]
  /** Whether they head or assist this team — AuthContext's own test, when there is one. */
  leads?: (departmentId: string) => boolean
  /** Teams whose roster they are on. */
  memberTeams: readonly string[]
  /** Whether the rota has them in Team Coordinator anywhere. */
  coordinatesAnywhere?: boolean
}

/** Where the thing being done sits. */
export interface Where {
  departmentId?: string | null
  /** The rota has them in Team Coordinator for this team, at this service. */
  coordinating?: boolean
  /** Whose the row is. */
  ownerId?: string | null
}

/** Who gave a yes: the Owner, or the profile whose reach covered it. */
export type Granter = 'owner' | GrantRole

/**
 * Which of this person's profiles lets them do this, here — the first, in
 * `may()`'s own order — or null when none does. `decide()` is this, asked
 * as a yes or no; Settings › Access › By person asks it for the reason.
 *
 * Mirrors `may()` in SQL: the Owner always; otherwise any profile they
 * hold that reaches this far — on this team by the team's own rule where
 * it made one (0162), else the church's.
 */
export function grantedBy(
  overrides: Overrides,
  holder: Holder,
  cap: CapabilityKey,
  where: Where = {},
  teams: TeamOverrides = {},
): Granter | null {
  if (!holder.myId) return null
  if (holder.owner) return 'owner'
  const mine = !!where.ownerId && where.ownerId === holder.myId
  const dept = where.departmentId ?? null
  const on = (role: GrantRole) => reachOn(overrides, teams, dept, cap, role)

  let reach = reachOf(overrides, cap, 'newcomer')
  if (reach === 'all' || (reach !== 'none' && mine)) return 'newcomer'

  reach = reachOf(overrides, cap, 'admin')
  if (reach !== 'none' && holder.admin && (reach === 'all' || mine)) return 'admin'

  // The Head and the Assisting Head: two profiles since 0162, the same
  // rules unless the church says otherwise. A holder that does not say
  // which teams it heads is read as heading every team it leads.
  const headTeams = holder.headTeams ?? holder.ledTeams
  const assistTeams = holder.assistTeams ?? []
  const leadsHere = !!dept && (holder.leads ? holder.leads(dept) : holder.ledTeams.includes(dept))
  const headsHere = !!dept && (holder.headTeams ? headTeams.includes(dept) : leadsHere)
  const assistsHere = !!dept && assistTeams.includes(dept)

  reach = on('head')
  if (reach !== 'none' && (headTeams.length > 0 || headsHere)) {
    if (reach === 'all' || mine || (reach === 'team' && headsHere)) return 'head'
  }

  reach = on('assistant')
  if (reach !== 'none' && (assistTeams.length > 0 || assistsHere)) {
    if (reach === 'all' || mine || (reach === 'team' && assistsHere)) return 'assistant'
  }

  reach = on('member')
  if (reach !== 'none') {
    if (reach === 'team' && !!dept && holder.memberTeams.includes(dept)) return 'member'
    if ((reach === 'all' || mine) && holder.memberTeams.length > 0) return 'member'
  }

  reach = on('coordinator')
  if (reach !== 'none') {
    if ((reach === 'team' || reach === 'all') && !!dept && where.coordinating) return 'coordinator'
    if ((reach === 'all' || mine) && (holder.coordinatesAnywhere || where.coordinating)) return 'coordinator'
  }

  return null
}

/** May this person do this, here? `grantedBy()`, as a yes or no. */
export function decide(
  overrides: Overrides,
  holder: Holder,
  cap: CapabilityKey,
  where: Where = {},
  teams: TeamOverrides = {},
): boolean {
  return grantedBy(overrides, holder, cap, where, teams) !== null
}

/**
 * Whether this person may do this on some team, but not necessarily
 * everywhere — for deciding which teams a page should offer them.
 * "Everywhere" for any profile they hold widens it to every team.
 */
export function reachesEverywhere(overrides: Overrides, holder: Holder, cap: CapabilityKey): boolean {
  return decide(overrides, holder, cap, { departmentId: null })
}
