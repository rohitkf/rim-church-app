import { supabase } from './supabaseClient'
import { PERMISSIONS, ROLES, type RoleKey } from './permissionMatrix'
import { GRID_ROLES, REACH_LABEL, isCapabilityKey, ruleFor, type GridRole, type Reach } from './permissions'
import { formatUntil, inDate } from './grantUntil'

/**
 * Who changed which rule (0216): `permission_changes`, a row for every
 * change to the grid, a team's own rules or a grant, read newest first,
 * and each said as a sentence.
 */

export interface PermissionChangeRow {
  id: string
  changed_at: string
  changed_by: string | null
  kind: 'cell' | 'team' | 'grant'
  capability: string
  role_key: string | null
  department_id: string | null
  user_id: string | null
  before: string | null
  after: string | null
  leads_only_before: boolean | null
  leads_only_after: boolean | null
  until_before: string | null
  until_after: string | null
}

/** How many of the latest changes are read. */
export const SHOWN = 200

export type ChangeKind = PermissionChangeRow['kind']

/** The three kinds of change, as the History filter offers them. */
export const CHANGE_KINDS: { value: ChangeKind | ''; label: string }[] = [
  { value: '', label: 'Every change' },
  { value: 'cell', label: 'The church’s cells' },
  { value: 'team', label: 'Teams’ own rules' },
  { value: 'grant', label: 'Grants' },
]

export async function fetchChanges(): Promise<PermissionChangeRow[]> {
  const { data, error } = await supabase
    .from('permission_changes')
    .select(
      'id, changed_at, changed_by, kind, capability, role_key, department_id, user_id, before, after, leads_only_before, leads_only_after, until_before, until_after',
    )
    .order('changed_at', { ascending: false })
    .limit(SHOWN)
  if (error) throw error
  return (data ?? []) as PermissionChangeRow[]
}

const actionOf = (cap: string) => PERMISSIONS.flatMap((a) => a.capabilities).find((c) => c.key === cap)?.action ?? cap
const roleOf = (role: string | null) => ROLES.find((r) => r.key === (role as RoleKey))?.label ?? role ?? 'Somebody'
const reachLabel = (reach: string | null) => (reach && reach in REACH_LABEL ? REACH_LABEL[reach as Reach] : reach ?? '')

/** A church cell with no row is at the app's default: said as that, so the change reads both ways. */
function cellReach(cap: string, role: string | null, reach: string | null): string {
  if (reach) return reachLabel(reach)
  if (!isCapabilityKey(cap) || !role) return 'the default'
  return `${REACH_LABEL[ruleFor(cap, role as GridRole).byDefault]} (the default)`
}

/** One change, said as a sentence. */
export function describeChange(
  row: PermissionChangeRow,
  personName: (id: string) => string,
  teamName: (id: string) => string,
): string {
  const action = actionOf(row.capability)
  if (row.kind === 'cell') {
    return `${roleOf(row.role_key)} · ${action}: ${cellReach(row.capability, row.role_key, row.before)} → ${cellReach(row.capability, row.role_key, row.after)}`
  }
  if (row.kind === 'team') {
    const team = row.department_id ? teamName(row.department_id) : 'A team'
    return `${team} · ${roleOf(row.role_key)} · ${action}: ${row.before ? reachLabel(row.before) : 'As the church'} → ${row.after ? reachLabel(row.after) : 'As the church'}`
  }
  const leads = row.leads_only_after ?? row.leads_only_before
  const team = row.department_id ? teamName(row.department_id) : 'a team'
  const who = row.user_id ? personName(row.user_id) : leads ? `the Heads of ${team}` : `everybody on ${team}`
  const how = (reach: string | null) => (reach === 'team' ? 'on their teams' : 'everywhere')
  const until = row.until_after ? ` until ${formatUntil(row.until_after)}` : ''
  if (!row.before) return `Gave ${who} “${action}”, ${how(row.after)}${until}`
  // A dated grant the app removed on its own had run out (0218).
  if (!row.after) return !row.changed_by && row.until_before ? `“${action}” for ${who} ran out` : `Took back “${action}” from ${who}`
  if (row.before !== row.after) return `Changed ${who}’s “${action}”: ${how(row.before)} → ${how(row.after)}${until}`
  if (row.leads_only_before !== row.leads_only_after) {
    return `Changed ${team}’s “${action}” to ${row.leads_only_after ? 'its Heads only' : 'everybody on it'}${until}`
  }
  return `Changed ${who}’s “${action}” to ${row.until_after ? `end on ${formatUntil(row.until_after)}` : 'have no end date'}`
}

/** Whether a change reads as `query` says — its sentence, or who made it. */
export function changeMatches(
  row: PermissionChangeRow,
  query: string,
  personName: (id: string) => string,
  teamName: (id: string) => string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const by = row.changed_by ? personName(row.changed_by) : 'the app itself'
  return `${describeChange(row, personName, teamName)} ${by}`.toLowerCase().includes(q)
}

/** The call that undoes one change: the rule as it was before, said again. */
export type PutBack =
  | { fn: 'set_permissions'; args: { p_changes: { role: string; capability: string; reach: string | null; department?: string }[] } }
  | {
      fn: 'set_permission_grants'
      args: { p_changes: { capability: string; person?: string; team?: string; reach: string | null; leads_only?: boolean; until?: string | null }[] }
    }

/**
 * How to put a change back — or null when it cannot be: a cell or a
 * profile the grid no longer has, or a grant that ran out (giving it
 * again with its old date would be refused; By person gives it anew).
 */
export function putBack(row: PermissionChangeRow): PutBack | null {
  if (row.kind === 'grant') {
    if (row.before && row.until_before && !inDate(row.until_before)) return null
    if (!row.user_id && !row.department_id) return null
    const who = row.user_id ? { person: row.user_id } : { team: row.department_id! }
    if (!row.before) return { fn: 'set_permission_grants', args: { p_changes: [{ capability: row.capability, ...who, reach: null }] } }
    const leads = row.department_id ? { leads_only: row.leads_only_before ?? false } : {}
    return {
      fn: 'set_permission_grants',
      args: { p_changes: [{ capability: row.capability, ...who, reach: row.before, ...leads, until: row.until_before }] },
    }
  }
  if (!row.role_key || !isCapabilityKey(row.capability) || !GRID_ROLES.includes(row.role_key as GridRole)) return null
  if (row.kind === 'team') {
    if (!row.department_id) return null
    return {
      fn: 'set_permissions',
      args: { p_changes: [{ role: row.role_key, capability: row.capability, reach: row.before, department: row.department_id }] },
    }
  }
  // A church cell with no row before was at the app's default: set_permissions() keeps it so when told that reach.
  const reach = row.before ?? ruleFor(row.capability, row.role_key as GridRole).byDefault
  return { fn: 'set_permissions', args: { p_changes: [{ role: row.role_key, capability: row.capability, reach }] } }
}
