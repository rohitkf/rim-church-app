/**
 * Every page that lists services, in the same four sections.
 *
 *   Today's services   today's, until each is done on this page
 *   Next service       every service on the next service day after today
 *   Upcoming services  everything after that
 *   Finished services  what is done, newest day first
 *
 * "Done" is the page's own rule, passed in: a rota is done when the
 * service ends, the Issues page when its entry window closes, the
 * checklists when the "After the service" half closes. So a morning
 * service can be under Finished while the evening one is still under
 * Today — which is the point: the section says whether there is anything
 * left to do on this page.
 *
 * The Next service day is chosen from what is not done, so it is never a
 * day already over. Each list comes back in running order (by date, then
 * by start where the caller sorts that way); Finished comes back newest
 * day first, each day still in its own order.
 */

export interface SectionedServices<T> {
  today: T[]
  next: T[]
  upcoming: T[]
  finished: T[]
}

export function sectionServices<T extends { id: string; date: string }>(
  services: T[],
  today: string,
  /** Done on this page. A day before today is done whatever this says. */
  isDone: (service: T) => boolean,
): SectionedServices<T> {
  const ordered = [...services].sort((a, b) => a.date.localeCompare(b.date))
  const done = (s: T) => s.date < today || isDone(s)
  const ahead = ordered.filter((s) => s.date > today && !done(s))
  const nextDate = ahead[0]?.date ?? null
  const finished = ordered.filter(done)
  return {
    today: ordered.filter((s) => s.date === today && !done(s)),
    next: ahead.filter((s) => s.date === nextDate),
    upcoming: ahead.filter((s) => s.date !== nextDate),
    finished: newestDayFirst(finished),
  }
}

/** Newest day first, but each day still in its own running order. */
function newestDayFirst<T extends { date: string }>(services: T[]): T[] {
  const dates = [...new Set(services.map((s) => s.date))].sort().reverse()
  return dates.flatMap((d) => services.filter((s) => s.date === d))
}
