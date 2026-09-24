import type { ServiceState } from './serviceState'

/**
 * Which services the dashboard lists, and which of them open on their own.
 *
 * The dashboard used to be one day: whatever was nearest, with every ring,
 * bar and feed on the screen at once. That is the right page on a Sunday
 * morning and a wall of arrangements on a Tuesday — and it could only ever
 * answer for one day, so a midweek service and the Sunday after it were
 * two different visits to the same page.
 *
 * So it became a list: everything in the next four weeks, each one a line.
 * That was too much the other way — on a Sunday with two services the page
 * led with today's pair and then next week's pair, and the church asked for
 * only the ones coming up. So it lists the next day that has services on
 * it, all of them, and nothing after; Previous/Next still step to any other
 * day. The detail behind each line opens on its own on the day itself,
 * which is the day the detail is worth the room.
 */

export interface ListedService {
  id: string
  date: string
  service_type: string
}

/**
 * The services on the nearest day that has any, from today onwards.
 *
 * Today counts even once it is over: a service that finished this morning
 * is still what somebody is asking the dashboard about this afternoon, and
 * a day that empties itself at noon reads as a day with nothing on it.
 *
 * However far off that day is, it comes: a church that plans a quarter
 * ahead should not get a page that says nothing is coming.
 */
export function upcomingServices<T extends ListedService>(services: T[], today: string): T[] {
  const next = services.reduce<string | null>(
    (nearest, service) =>
      service.date >= today && (nearest === null || service.date < nearest) ? service.date : nearest,
    null,
  )
  return services
    .filter((service) => service.date === next)
    .sort((a, b) => a.service_type.localeCompare(b.service_type))
}

/**
 * The listed services in the order the day runs them.
 *
 * Two services on one morning are not interchangeable, and the one that
 * comes first is a fact about the running order rather than about the
 * name — so the start times decide, and anything unplanned follows the
 * services that have an hour.
 */
export function inStartOrder<T extends ListedService>(
  services: T[],
  startOf: (service: T) => string | null,
): T[] {
  return [...services].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const at = startOf(a)
    const bt = startOf(b)
    return (
      (at ? Date.parse(at) : Infinity) - (bt ? Date.parse(bt) : Infinity) ||
      a.service_type.localeCompare(b.service_type)
    )
  })
}

/**
 * Whether a service arrives already open.
 *
 * On the day, and only on the day: that is the morning somebody needs the
 * rings, the feed and who is still to answer, and every other morning they
 * need to know it is coming and nothing else. A service that has already
 * finished stays shut whatever day it is — it is a record, and a record
 * that unfolds itself pushes the one still to come off the screen.
 */
export function opensOnItsOwn(date: string, focusDate: string, state: ServiceState): boolean {
  return date === focusDate && state !== 'done'
}
