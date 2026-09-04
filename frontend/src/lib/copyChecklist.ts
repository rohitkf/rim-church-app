import { PHASES } from './checklistPhase'
import type { ChecklistPhase, RoleChecklistItem } from './types'

/** One row to be written for the role being copied into. */
export interface CopiedChecklistItem {
  label: string
  phase: ChecklistPhase
  sort_order: number
}

/**
 * Taking another role's checklist wholesale.
 *
 * Camera Operator 2 does very nearly what Camera Operator 1 does. Building
 * that list a line at a time — even with the suggestions box offering each
 * one — is ten interactions to say a single thing: *the same as them*. So
 * the whole list can be taken in one go.
 *
 * It is a copy, not a link. Once the items are here they belong to this
 * role: it can add its own, drop the two that do not apply, and reword a
 * third, and nothing about the role it copied from changes or interferes.
 * A live mirror would be the more clever answer and the wrong one — a head
 * tidying Camera Operator 1 would silently rewrite three other roles, and
 * the one thing worse than typing a checklist twice is a checklist that
 * changes when nobody touched it.
 *
 * Both halves come across by default: "same as Camera Operator 1" plainly
 * means the whole job, and taking only what is before the service would
 * leave somebody to notice the missing half on their own. `onlyItemIds`
 * is how somebody says otherwise — the picker hands over exactly the rows
 * that were ticked, and everything else about the copy is unchanged.
 */
export function itemsToCopy({
  items,
  fromRoleId,
  toRoleId,
  onlyItemIds,
}: {
  /** Every checklist item on the team, across all its roles. */
  items: RoleChecklistItem[]
  fromRoleId: string
  toRoleId: string
  /** Left out, the whole of the source role's list comes across. */
  onlyItemIds?: ReadonlySet<string>
}): CopiedChecklistItem[] {
  if (!fromRoleId || fromRoleId === toRoleId) return []

  // What this role already has, per phase. Matched on wording rather than
  // on row, ignoring case and edge whitespace, so copying twice — or
  // copying from a role that shares half its list with this one — adds
  // only what is genuinely new instead of doubling lines up.
  const has = new Map<ChecklistPhase, Set<string>>()
  // Where each phase's list currently ends, so copied items land after
  // what is already written rather than interleaved with it.
  const nextOrder = new Map<ChecklistPhase, number>()

  for (const item of items) {
    if (item.role_id !== toRoleId) continue
    const phase = item.phase
    if (!has.has(phase)) has.set(phase, new Set())
    has.get(phase)!.add(item.label.trim().toLowerCase())
    nextOrder.set(phase, Math.max(nextOrder.get(phase) ?? 0, item.sort_order + 1))
  }

  // Grouped by phase, each in its own order. Sorting on sort_order alone
  // interleaves the two halves — a "post" item numbered 0 landing between
  // "pre" items 0 and 1 — which is only invisible because the page splits
  // them again when it draws them. The rows should read the way they will
  // be shown.
  const phaseRank = new Map(PHASES.map((p, i) => [p.value, i]))
  const source = items
    .filter((i) => i.role_id === fromRoleId && (!onlyItemIds || onlyItemIds.has(i.id)))
    .sort(
      (a, b) =>
        (phaseRank.get(a.phase) ?? 0) - (phaseRank.get(b.phase) ?? 0) ||
        a.sort_order - b.sort_order,
    )

  const copied: CopiedChecklistItem[] = []
  // Tracks wording taken during this copy as well as before it, so a
  // source role holding the same line twice does not plant it twice here.
  const taken = new Map<ChecklistPhase, Set<string>>()

  for (const item of source) {
    const label = item.label.trim()
    if (!label) continue
    const phase = item.phase
    const key = label.toLowerCase()
    if (has.get(phase)?.has(key)) continue
    if (!taken.has(phase)) taken.set(phase, new Set())
    if (taken.get(phase)!.has(key)) continue
    taken.get(phase)!.add(key)

    const order = nextOrder.get(phase) ?? 0
    nextOrder.set(phase, order + 1)
    copied.push({ label, phase, sort_order: order })
  }

  return copied
}

/**
 * The roles worth offering to copy from: anybody on this team but this
 * role, who has something to give. A role with an empty checklist in the
 * menu is a promise of nothing.
 */
export function rolesWithChecklists({
  items,
  roles,
  excludeRoleId,
}: {
  items: RoleChecklistItem[]
  roles: { id: string; name: string }[]
  excludeRoleId: string
}): { id: string; name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.role_id, (counts.get(item.role_id) ?? 0) + 1)
  }
  return roles
    .filter((r) => r.id !== excludeRoleId && (counts.get(r.id) ?? 0) > 0)
    .map((r) => ({ id: r.id, name: r.name, count: counts.get(r.id)! }))
}
