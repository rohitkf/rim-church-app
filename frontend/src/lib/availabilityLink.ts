/**
 * A link straight to one team's answers for one service on Availability.
 *
 * The dashboard's Teams on duty rows used to land on the top of the page,
 * leaving whoever touched "Media" to find the service and open the team
 * themselves. With these two in the address the page opens that service,
 * opens the team's own responses (for whoever may read them) and scrolls
 * to it.
 */
export const AVAILABILITY_SERVICE_PARAM = 'service'
export const AVAILABILITY_TEAM_PARAM = 'team'

export function availabilityLink(serviceId: string, departmentId: string): string {
  const q = new URLSearchParams({
    [AVAILABILITY_SERVICE_PARAM]: serviceId,
    [AVAILABILITY_TEAM_PARAM]: departmentId,
  })
  return `/availability?${q.toString()}`
}

/** The element id of a team's row under a service, for the scroll. */
export function availabilityTeamAnchor(serviceId: string, departmentId: string): string {
  return `availability-${serviceId}-${departmentId}`
}
