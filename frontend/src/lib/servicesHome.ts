/*
 * Where the list of services is.
 *
 * The services are planned from the Calendar (November 2026): its
 * Services view is the list the Service Planner page used to be. Somebody
 * the Calendar is closed to but the planner is not still has the list on
 * its own page, so a link back to "the services" asks which they have.
 */

/** The Calendar, showing the services. */
export const SERVICES_IN_CALENDAR = '/events?show=service'

/** The list of services, for somebody who may open what `canOpen` says. */
export function servicesHome(canOpen: (path: string) => boolean): string {
  return canOpen('/events') ? SERVICES_IN_CALENDAR : '/service-planner'
}
