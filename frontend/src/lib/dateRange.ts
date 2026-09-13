/**
 * Days as the calendar counts them.
 *
 * Everything here works on plain `YYYY-MM-DD` strings rather than `Date`
 * objects, because a church diary is about days, not moments: an event on
 * the 14th is on the 14th in every timezone, and the moment you put a
 * `Date` in the middle of it somebody in another country sees the 13th.
 * Strings in this format also sort and compare correctly as text, which is
 * what most of this file relies on.
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** Midday, so a day's arithmetic can never fall over a DST boundary. */
function at(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12)
}

export function isoOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(iso: string, days: number): string {
  const d = at(iso)
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

/** How many days a run covers, counting both ends. A single day is 1. */
export function dayCount(from: string, to: string): number {
  if (to < from) return 0
  return Math.round((at(to).getTime() - at(from).getTime()) / 86_400_000) + 1
}

/** Every day from one to the other, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

export function isWithin(day: string, from: string, to: string): boolean {
  return day >= from && day <= to
}

/**
 * A range as somebody would write it.
 *
 * The month is said once when both ends share it — "18–20 Sep 2026" rather
 * than "18 Sep 2026 – 20 Sep 2026", which is how a date turns into
 * paperwork. The year is dropped only when it is this one.
 */
export function formatRange(from: string, to?: string | null, today?: string): string {
  const thisYear = (today ?? isoOf(new Date())).slice(0, 4)
  const day = (iso: string) => at(iso).toLocaleDateString(undefined, { day: 'numeric' })
  const monthOf = (iso: string) => at(iso).toLocaleDateString(undefined, { month: 'short' })
  const yearOf = (iso: string) => (iso.slice(0, 4) === thisYear ? '' : ` ${iso.slice(0, 4)}`)

  if (!to || to === from) return `${day(from)} ${monthOf(from)}${yearOf(from)}`
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${day(from)}–${day(to)} ${monthOf(to)}${yearOf(to)}`
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${day(from)} ${monthOf(from)}${sameYear ? '' : yearOf(from)} – ${day(to)} ${monthOf(to)}${yearOf(to)}`
}
