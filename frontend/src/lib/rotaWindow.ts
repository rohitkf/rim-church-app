/**
 * Which services a page puts in front of you.
 *
 * This started as a fixed count — the next two or three — which is the
 * wrong unit. Nobody thinks "show me three services"; they think "what is
 * on this week". A fixed count also cuts arbitrarily: a Sunday with a
 * morning, an evening and a Malayalam service used up the whole window on
 * one day, so the week after was invisible until that day had passed.
 *
 * So the window is a week, and it is measured in days:
 *
 *   - everything still to come in the next seven days, and
 *   - if that is empty, everything on the nearest day that has a service,
 *     however far out it is — the page should never be blank while a
 *     service exists to show.
 *
 * A service that has finished stops holding the window open: once today's
 * services are over, next week's are already the answer to "what's next",
 * so they appear straight away rather than waiting for midnight. The
 * finished ones stay on the page for the rest of their day — collapsed,
 * because they are a record now, not a question — and drop off when the
 * date does.
 */

export const WINDOW_DAYS = 7

/** How far ahead to fetch before windowing. Wide enough that the fallback
 *  to "the nearest day with a service" has something to find. */
export const LOOKAHEAD_DAYS = 120

export interface WindowedService {
  id: string
  date: string
  service_type: string
}

/** `date` shifted by whole days, staying an ISO calendar date. */
export function shiftIsoDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d + days))
  return at.toISOString().slice(0, 10)
}

function inOrder<T extends WindowedService>(services: T[]): T[] {
  return [...services].sort(
    (a, b) => a.date.localeCompare(b.date) || a.service_type.localeCompare(b.service_type),
  )
}

/**
 * Everything worth fetching for: from today out to the look-ahead. Pages
 * ask this first, work out which of them have finished, and then narrow
 * with `servicesToShow`.
 */
export function servicesAhead<T extends WindowedService>(services: T[], today: string): T[] {
  return inOrder(services.filter((s) => s.date >= today))
}

export function servicesToShow<T extends WindowedService>(
  services: T[],
  today: string,
  {
    days = WINDOW_DAYS,
    /** Services this person is on, which are never left out however far out they are. */
    mine = new Set<string>(),
    /** Which of these are over. Finished services no longer hold the window open. */
    isFinished = () => false,
  }: {
    days?: number
    mine?: ReadonlySet<string>
    isFinished?: (serviceId: string) => boolean
  } = {},
): T[] {
  const ahead = servicesAhead(services, today)
  const open = ahead.filter((s) => !isFinished(s.id))

  const horizon = shiftIsoDays(today, days)
  const thisWeek = open.filter((s) => s.date <= horizon)
  // Nothing this week: fall through to the nearest day that has one, and
  // take every service on that day rather than an arbitrary first.
  const nearestDay = open[0]?.date
  const picked = thisWeek.length > 0 ? thisWeek : open.filter((s) => s.date === nearestDay)

  const shown = new Set(picked.map((s) => s.id))
  // Finished services stay for the rest of their own day, and anything
  // this person is personally on is never dropped.
  return ahead.filter((s) => shown.has(s.id) || isFinished(s.id) || mine.has(s.id))
}
