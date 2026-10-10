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
export type GrantRole = 'admin' | 'head' | 'coordinator' | 'member' | 'newcomer'

export const GRANT_ROLES: readonly GrantRole[] = ['admin', 'head', 'coordinator', 'member', 'newcomer']

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
    coordinator: fixed(),
    member: fixed(),
    newcomer: fixed(),
  },
  'rota.assign': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'rota.tag': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team all', 'none'),
    newcomer: fixed(),
  },
  'rota.release_ask': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team', 'none'),
    newcomer: fixed(),
  },
  'rota.release_decide': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'team'),
    coordinator: offer('none team', 'none'),
    member: offer('none team', 'none'),
    newcomer: fixed(),
  },
  'rota.release_delete': {
    admin: offer('none all', 'all'),
    head: offer('none team all', 'none'),
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
 * The reach in force: the church's choice if it is still on offer,
 * otherwise the default. The same order `permission_reach()` uses.
 */
export function reachOf(overrides: Overrides, cap: CapabilityKey, role: GrantRole): Reach {
  const rule = ruleFor(cap, role)
  const chosen = overrides[cap]?.[role]
  return chosen && rule.reaches.includes(chosen) ? chosen : rule.byDefault
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

/** One cell, as `set_permissions()` takes it. */
export interface PermissionChange {
  role: GrantRole
  capability: CapabilityKey
  reach: Reach
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

/**
 * May this person do this, here? Mirrors `may()` in SQL: the Owner always;
 * otherwise any profile they hold that reaches this far.
 */
export function decide(overrides: Overrides, holder: Holder, cap: CapabilityKey, where: Where = {}): boolean {
  if (!holder.myId) return false
  if (holder.owner) return true
  const mine = !!where.ownerId && where.ownerId === holder.myId
  const dept = where.departmentId ?? null

  let reach = reachOf(overrides, cap, 'newcomer')
  if (reach === 'all' || (reach !== 'none' && mine)) return true

  reach = reachOf(overrides, cap, 'admin')
  if (reach !== 'none' && holder.admin && (reach === 'all' || mine)) return true

  reach = reachOf(overrides, cap, 'head')
  if (reach !== 'none' && holder.ledTeams.length > 0) {
    if (reach === 'all' || mine || (reach === 'team' && !!dept && holder.ledTeams.includes(dept))) return true
  }

  reach = reachOf(overrides, cap, 'member')
  if (reach !== 'none') {
    if (reach === 'team' && !!dept && holder.memberTeams.includes(dept)) return true
    if ((reach === 'all' || mine) && holder.memberTeams.length > 0) return true
  }

  reach = reachOf(overrides, cap, 'coordinator')
  if (reach !== 'none') {
    if ((reach === 'team' || reach === 'all') && !!dept && where.coordinating) return true
    if ((reach === 'all' || mine) && (holder.coordinatesAnywhere || where.coordinating)) return true
  }

  return false
}

/**
 * Whether this person may do this on some team, but not necessarily
 * everywhere — for deciding which teams a page should offer them.
 * "Everywhere" for any profile they hold widens it to every team.
 */
export function reachesEverywhere(overrides: Overrides, holder: Holder, cap: CapabilityKey): boolean {
  return decide(overrides, holder, cap, { departmentId: null })
}
