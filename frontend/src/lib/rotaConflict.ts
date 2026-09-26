import { isCoordinatorRole } from './useTeamCoordinator'

interface Held {
  service_id: string
  department_id: string
  user_id: string
  role_label: string
}

/**
 * What stops this person taking this role at this service, if anything —
 * the same rule the database holds (0084), asked before the database is.
 *
 * One role per person per service. Team Coordinator is not one of them: it
 * sits alongside a job rather than replacing it, so coordinating never
 * blocks a role and a role never blocks coordinating. It only blocks
 * coordinating the same team twice.
 *
 * A shadow is still their role at that service — they are there, learning
 * it — so it counts like any other.
 */
export function rotaConflict<T extends Held>(
  assignments: T[],
  wanted: { serviceId: string; departmentId: string; userId: string; roleLabel: string },
): T | null {
  const theirs = assignments.filter(
    (a) => a.service_id === wanted.serviceId && a.user_id === wanted.userId,
  )
  if (isCoordinatorRole(wanted.roleLabel)) {
    return (
      theirs.find((a) => a.department_id === wanted.departmentId && isCoordinatorRole(a.role_label)) ??
      null
    )
  }
  return theirs.find((a) => !isCoordinatorRole(a.role_label)) ?? null
}
