import { supabase } from './supabaseClient'
import { PERMISSIONS, ROLES, type RoleKey } from './permissionMatrix'
import { REACH_LABEL, isCapabilityKey, ruleFor, type GridRole, type Reach } from './permissions'

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
}

/** How many of the latest changes are read. */
export const SHOWN = 200

export async function fetchChanges(): Promise<PermissionChangeRow[]> {
  const { data, error } = await supabase
    .from('permission_changes')
    .select('id, changed_at, changed_by, kind, capability, role_key, department_id, user_id, before, after, leads_only_before, leads_only_after')
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
  if (!row.before) return `Gave ${who} “${action}”, ${how(row.after)}`
  if (!row.after) return `Took back “${action}” from ${who}`
  if (row.before !== row.after) return `Changed ${who}’s “${action}”: ${how(row.before)} → ${how(row.after)}`
  return `Changed ${team}’s “${action}” to ${row.leads_only_after ? 'its Heads only' : 'everybody on it'}`
}
