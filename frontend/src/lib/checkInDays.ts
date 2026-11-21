/**
 * Who came on which day (0314).
 *
 * A registration has one `checked_in_at`, the latest. An event of several
 * days checks people in on each, and each of those is kept by its day in
 * `registration_check_ins` — read with the registration as `check_ins`.
 * This is what the event's page and the export make of them: the days
 * there were, what each is called, how many came, and one registration's
 * own.
 *
 * A day is the church's day (the database dates each check-in by the
 * church's time zone), so it is compared as a date, never re-derived from
 * a time on this device.
 */

export interface CheckIn {
  /** The church's day, `YYYY-MM-DD`. */
  on_date: string
  checked_in_at: string
}

type WithCheckIns = { check_ins?: CheckIn[] | null }

/** One registration's check-ins, the first day first. */
export function checkInsOf(order: WithCheckIns): CheckIn[] {
  return [...(order.check_ins ?? [])].sort((a, b) => a.on_date.localeCompare(b.on_date))
}

/** The days anybody among these was checked in on, the first first. */
export function checkInDays(orders: WithCheckIns[]): string[] {
  return [...new Set(orders.flatMap((o) => (o.check_ins ?? []).map((c) => c.on_date)))].sort()
}

/** A date as this device's own day, `YYYY-MM-DD`: for matching one of the event's dates to a check-in day. */
function localDay(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "Fri 20 Nov", in the order the device writes dates. */
export function shortDay(day: string, locale?: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * What a check-in day is called: the event's own name for it ("Day 1")
 * when one of the event's dates falls on it and has a name, otherwise the
 * day itself ("Fri 20 Nov").
 */
export function checkInDayName(day: string, dates: { starts_at: string; label: string | null }[], locale?: string): string {
  const named = dates.find((d) => localDay(d.starts_at) === day && d.label?.trim())
  return named?.label?.trim() || shortDay(day, locale)
}

/** How many came each day, the first day first: registrations, and the people on them. */
export function checkInCounts<T extends WithCheckIns & { quantity: number }>(orders: T[]): { day: string; registrations: number; people: number }[] {
  return checkInDays(orders).map((day) => {
    const came = orders.filter((o) => (o.check_ins ?? []).some((c) => c.on_date === day))
    return { day, registrations: came.length, people: came.reduce((n, o) => n + o.quantity, 0) }
  })
}

/** Whether this registration was ever checked in: on any day kept, or by its own latest time. */
export function everCheckedIn(order: WithCheckIns & { checked_in_at: string | null }): boolean {
  return !!order.checked_in_at || (order.check_ins ?? []).length > 0
}
