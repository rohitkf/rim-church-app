/**
 * A grant's end date (0218). It is chosen as a day — "until the 12th" —
 * and kept as the moment that day ends on the chooser's clock, so the
 * database and every phone agree on when it is over.
 */

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** "2026-11-12" → the moment the 12th ends here, as the database keeps it. */
export function untilFromDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d + 1).toISOString()
}

/** The day a kept end covers through: "2026-11-12" for a grant that ends as the 12th does. */
export function dayOfUntil(until: string): string {
  return iso(new Date(new Date(until).getTime() - 60_000))
}

/** "12 Nov 2026", in the reader's own words. */
export function formatUntil(until: string): string {
  return new Date(`${dayOfUntil(until)}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The first day a grant could end: tomorrow. */
export function earliestUntilDay(now = new Date()): string {
  return iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
}

/** Still in date: no end, or an end not yet reached. */
export function inDate(expiresAt: string | null | undefined, now = Date.now()): boolean {
  return !expiresAt || Date.parse(expiresAt) > now
}
