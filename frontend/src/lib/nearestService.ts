/**
 * The service day the checklists page is about: the soonest day that has
 * services, counting today. Volunteers only ever need the next service —
 * showing every future week's checklist just buries it. When nothing is
 * scheduled ahead, fall back to the most recent past day so the page
 * still has something to show.
 */
export function nearestServiceDate(dates: string[], today: string): string | null {
  if (dates.length === 0) return null
  const upcoming = dates.filter((d) => d >= today).sort()
  if (upcoming.length > 0) return upcoming[0]
  return [...dates].sort().pop() ?? null
}
