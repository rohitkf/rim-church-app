/**
 * The headings over the Dashboard's services that are not over yet.
 *
 * It was one heading, "Upcoming services", over all of them — including a
 * service that had started an hour ago, which is not upcoming by any
 * reading. So the list is said in the order it happens: what is on now,
 * what is still to come today, and what is on a later day. A section with
 * nothing in it is not drawn, and on an ordinary weekday the whole of it
 * is "Upcoming services", as before.
 *
 * Finished services have their own folded section below (FinishedServices)
 * and are not this function's business.
 */
export interface DashboardSection<S> {
  key: 'now' | 'today' | 'upcoming'
  label: string
  services: S[]
}

export function dashboardSections<S extends { id: string; date: string }>(
  /** The services still to come or on, in the order they happen. */
  live: S[],
  isRunning: (service: S) => boolean,
  today: string,
): DashboardSection<S>[] {
  const now = live.filter(isRunning)
  const rest = live.filter((s) => !isRunning(s))
  const laterToday = rest.filter((s) => s.date === today)
  const upcoming = rest.filter((s) => s.date !== today)
  const sections: DashboardSection<S>[] = [
    { key: 'now', label: 'On now', services: now },
    // "Later today" only makes sense under something that is already on.
    { key: 'today', label: now.length > 0 ? 'Later today' : 'Today’s services', services: laterToday },
    { key: 'upcoming', label: 'Upcoming services', services: upcoming },
  ]
  return sections.filter((section) => section.services.length > 0)
}
