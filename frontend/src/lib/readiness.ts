import type { ChecklistItemStatus } from './types'

export interface StageCounts {
  total: number
  memberComplete: number
  headVerified: number
  coordinatorVerified: number
}

export interface Readiness extends StageCounts {
  /** Weighted completion, 0-100, or null when there is nothing to do. */
  pct: number | null
}

/**
 * An item is only truly ready once it has been through all three stages, so
 * each stage is worth a third of it: a member's tick is progress, the head's
 * verification is more progress, the coordinator's sign-off completes it.
 * Counting "not pending" alone would show 100% ready while nobody had
 * checked any of it.
 */
const STAGE_WEIGHT: Record<ChecklistItemStatus, number> = {
  pending: 0,
  member_complete: 1 / 3,
  head_verified: 2 / 3,
  coordinator_verified: 1,
}

export function readinessOf(counts: StageCounts): Readiness {
  if (counts.total <= 0) return { ...counts, pct: null }
  const weighted =
    counts.memberComplete * STAGE_WEIGHT.member_complete +
    counts.headVerified * STAGE_WEIGHT.head_verified +
    counts.coordinatorVerified * STAGE_WEIGHT.coordinator_verified
  return { ...counts, pct: Math.round((weighted / counts.total) * 100) }
}

interface AssignmentLike {
  id: string
  service_id: string
  department_id: string
  role_id: string | null
}
interface RoleItemLike {
  id: string
  role_id: string
}
interface ProgressLike {
  assignment_id: string
  item_id: string
  status: ChecklistItemStatus
}

const emptyCounts = (): StageCounts => ({
  total: 0,
  memberComplete: 0,
  headVerified: 0,
  coordinatorVerified: 0,
})

function add(counts: StageCounts, status: ChecklistItemStatus) {
  counts.total += 1
  if (status === 'member_complete') counts.memberComplete += 1
  if (status === 'head_verified') counts.headVerified += 1
  if (status === 'coordinator_verified') counts.coordinatorVerified += 1
}

/**
 * Readiness for one service, overall and per team.
 *
 * The work is defined by the rota: every person the rota puts on the service
 * owes the checklist of the role they were given. An item with no progress
 * row yet is pending, not absent — otherwise a service nobody had started
 * would read as 100% ready.
 */
export function serviceReadiness(input: {
  assignments: AssignmentLike[]
  roleItems: RoleItemLike[]
  progress: ProgressLike[]
}): { overall: Readiness; byDepartment: Map<string, Readiness> } {
  const itemsByRole = new Map<string, RoleItemLike[]>()
  for (const item of input.roleItems) {
    itemsByRole.set(item.role_id, [...(itemsByRole.get(item.role_id) ?? []), item])
  }

  const statusOf = new Map<string, ChecklistItemStatus>()
  for (const p of input.progress) statusOf.set(`${p.assignment_id}:${p.item_id}`, p.status)

  const overall = emptyCounts()
  const perDept = new Map<string, StageCounts>()

  for (const assignment of input.assignments) {
    if (!assignment.role_id) continue
    const counts = perDept.get(assignment.department_id) ?? emptyCounts()
    perDept.set(assignment.department_id, counts)

    for (const item of itemsByRole.get(assignment.role_id) ?? []) {
      const status = statusOf.get(`${assignment.id}:${item.id}`) ?? 'pending'
      add(counts, status)
      add(overall, status)
    }
  }

  const byDepartment = new Map<string, Readiness>()
  for (const [deptId, counts] of perDept) byDepartment.set(deptId, readinessOf(counts))

  return { overall: readinessOf(overall), byDepartment }
}
