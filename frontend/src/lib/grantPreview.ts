import { isCapabilityKey, type CapabilityKey, type GrantReach, type PermissionGrant } from './permissions'

/**
 * A grant change as set_permission_grants() takes it (0208, 0213): one
 * capability for a person by name or for a team, given at a reach or
 * taken back (reach null). The rooms, By person and By team all send
 * these; this is also what the preview applies to the grants as stored,
 * to say what saving would do before it is sent.
 */
export interface GrantChange {
  capability: string
  person?: string
  team?: string
  reach: GrantReach | null
  /** A team's grant for its Heads alone (0213). */
  leads_only?: boolean
}

/** The grants as they would be once these changes are saved. */
export function applyGrantChanges(grants: readonly PermissionGrant[], changes: readonly GrantChange[]): PermissionGrant[] {
  let out = [...grants]
  for (const c of changes) {
    out = out.filter((g) => !(g.capability === c.capability && (c.person ? g.userId === c.person : g.departmentId === c.team)))
    if (c.reach) {
      out.push({
        capability: c.capability,
        userId: c.person ?? null,
        departmentId: c.team ?? null,
        reach: c.reach,
        leadsOnly: !!c.team && !!c.leads_only,
      })
    }
  }
  return out
}

/** The actions a list of grant changes touches, each once. */
export function touchedBy(changes: readonly GrantChange[]): CapabilityKey[] {
  return [...new Set(changes.map((c) => c.capability))].filter(isCapabilityKey)
}
