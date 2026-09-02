import { isCoordinatorRole } from './useTeamCoordinator'

export interface GroupableRole {
  id: string
  name: string
  sort_order: number
  /** Every group this role belongs to. A role can be in several. */
  group_ids: string[]
}

export interface RoleGroup {
  id: string
  name: string
  sort_order: number
}

/**
 * A group as it is drawn: its heading, and the roles filed under it.
 *
 * Generic over the role, so a caller that has whole rows keeps them —
 * arranging a list should not cost it the fields it came with.
 */
export interface RenderedGroup<T extends GroupableRole = GroupableRole> {
  /** Null for the roles nobody has filed anywhere. */
  group: RoleGroup | null
  roles: T[]
}

/**
 * The name the ungrouped section goes by.
 *
 * Not "Not in a group", which reads as a fault to be corrected — most
 * teams have five roles and want no groups at all, and telling them
 * something is wrong on every visit would be nagging about nothing. This
 * is where roles live until somebody decides otherwise, which is a fine
 * place to be.
 */
export const UNGROUPED_LABEL = 'Everything else'

/**
 * The roles of a team, arranged for reading.
 *
 * Worship has twenty-four of them. Flat, that is a wall: finding "Drums 2"
 * means reading past nineteen names that are not it, and the shape of the
 * team — five leaders, seven backing vocals, a band — is obvious to
 * anybody standing in the room and invisible on the page.
 *
 * A role may sit under several headings. "Worship Leader 1" is genuinely
 * both a Worship Leader and a Vocal, and drawing it under both is not two
 * of the job — it is one job that belongs to two families, the way a
 * person is in two departments without there being two of them.
 *
 * The Team Coordinator is not in any of it. Every team has exactly one,
 * it is created for them rather than by them, and whoever holds it at a
 * service can verify that team's checklist — so it sits above the groups
 * rather than inside one, where it cannot be lost among twenty-three
 * ordinary jobs.
 */
export function arrangeRoles<T extends GroupableRole>({
  roles,
  groups,
}: {
  roles: T[]
  groups: RoleGroup[]
}): { coordinator: T | null; sections: RenderedGroup<T>[] } {
  const coordinator = roles.find((r) => isCoordinatorRole(r.name)) ?? null
  const rest = roles.filter((r) => r !== coordinator)

  const byOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
    a.sort_order - b.sort_order

  const known = new Set(groups.map((g) => g.id))
  const sections: RenderedGroup<T>[] = [...groups].sort(byOrder).map((group) => ({
    group,
    roles: rest.filter((r) => r.group_ids.includes(group.id)).sort(byOrder),
  }))

  // Unfiled means in no group that still exists. A membership pointing at
  // a deleted group is cleaned up by cascade, so this is a belt to that: a
  // page holding a stale list must not silently drop a role off the team.
  const ungrouped = rest
    .filter((r) => !r.group_ids.some((id) => known.has(id)))
    .sort(byOrder)

  // Shown when it has something in it, or when there are no groups at all
  // — a team that has never made one should still see its roles, without
  // a heading implying it has done something wrong.
  if (ungrouped.length > 0) {
    sections.push({ group: null, roles: ungrouped })
  }

  return { coordinator, sections }
}

/**
 * The whole team's order, rebuilt from how it is drawn.
 *
 * `reorder_department_roles` insists on every role of the team, once each
 * — a stale page cannot then half-apply an order it worked out before
 * somebody else added a role. So dragging within one group cannot send
 * just that group: the full list is rebuilt in reading order, which has
 * the pleasant side effect of making sort_order mean what the page shows
 * rather than drifting from it.
 */
export function fullRoleOrder<T extends GroupableRole>({
  coordinator,
  sections,
}: {
  coordinator: T | null
  sections: RenderedGroup<T>[]
}): string[] {
  const ids = coordinator ? [coordinator.id] : []
  // Once a role can sit under two headings it is drawn twice, and the RPC
  // wants each role once. First appearance wins, which is the order the
  // page reads top to bottom.
  const seen = new Set(ids)
  for (const section of sections) {
    for (const role of section.roles) {
      if (seen.has(role.id)) continue
      seen.add(role.id)
      ids.push(role.id)
    }
  }
  return ids
}

/**
 * That order again, with one group's roles replaced by a new arrangement
 * of the same roles — what a drag inside a group produces.
 */
export function reorderWithinGroup<T extends GroupableRole>({
  coordinator,
  sections,
  groupId,
  orderedIds,
}: {
  coordinator: T | null
  sections: RenderedGroup<T>[]
  groupId: string | null
  orderedIds: string[]
}): string[] {
  const next = sections.map((section) => {
    if ((section.group?.id ?? null) !== groupId) return section
    const byId = new Map(section.roles.map((r) => [r.id, r]))
    const moved = orderedIds.map((id) => byId.get(id)).filter((r): r is T => !!r)
    // Anything the dragged list did not mention keeps its place at the end
    // rather than vanishing from the team.
    const missing = section.roles.filter((r) => !orderedIds.includes(r.id))
    return { ...section, roles: [...moved, ...missing] }
  })
  return fullRoleOrder({ coordinator, sections: next })
}
