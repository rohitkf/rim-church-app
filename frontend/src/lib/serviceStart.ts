/**
 * The service that starts next, and how long until it does: the second
 * section of the Countdown page.
 *
 * The page's first section counts a running service's sessions. Before a
 * service starts it had nothing to say (a blank clock), and once one was
 * under way it said nothing of what followed. The Owner, November 2026:
 * "before a service starts … show the countdown of the service to start.
 * Once a service starts, show the timer countdown for the next service."
 *
 * So it is one rule either side of the start: the next service is the
 * earliest one that has not begun. Before today's first, that is today's
 * first. While it runs, it is whichever comes after — later today, or
 * next Sunday.
 */
import { clockFace } from './serviceClock'
import type { ServiceStanding } from './serviceState'

/**
 * The earliest service that has not started, and when it does. Null when
 * nothing with a running order is planned ahead.
 *
 * A service with no running order has no start to count to and is passed
 * over; one whose end has been called, or whose start has passed, is not
 * ahead.
 */
export function nextServiceToStart<T>(
  rows: readonly { service: T; standing: ServiceStanding }[],
  now: number,
): { service: T; at: number } | null {
  let next: { service: T; at: number } | null = null
  for (const row of rows) {
    const at = row.standing.from
    if (row.standing.state !== 'upcoming' || at === null || at <= now) continue
    if (!next || at < next.at) next = { service: row.service, at }
  }
  return next
}

/**
 * How long until then, as a clock: 4:05, 1:02:09, and with whole days in
 * front once it is a day or more off — 6d 14:22:31. Nobody reads
 * 158:22:31 (lib/countdown says the same of the Dashboard's clock).
 * Never negative: a start that has passed reads 0:00, and the page has
 * moved on to the next one by then.
 */
export function startFace(ms: number): string {
  const left = Math.max(0, ms)
  const days = Math.floor(left / 86_400_000)
  if (days === 0) return clockFace(left)
  const rest = Math.floor((left % 86_400_000) / 1000)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${days}d ${two(Math.floor(rest / 3600))}:${two(Math.floor((rest % 3600) / 60))}:${two(rest % 60)}`
}

/** The same, said aloud: "2 days 3 hours", "1 hour 12 minutes", "4 minutes", "under a minute". */
export function startWords(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const some = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (days > 0) return hours > 0 ? `${some(days, 'day')} ${some(hours, 'hour')}` : some(days, 'day')
  if (hours > 0) return minutes > 0 ? `${some(hours, 'hour')} ${some(minutes, 'minute')}` : some(hours, 'hour')
  if (minutes > 0) return some(minutes, 'minute')
  return 'under a minute'
}

/**
 * Which day that is, beside the time: nothing for today, "tomorrow", a
 * weekday inside the week ahead, and a date beyond it ("Sun" a fortnight
 * out is the wrong Sunday). The time itself is written by the page, in
 * the church's own clock, as every other time on it is.
 */
export function startDay(at: number, now: number): string {
  const startOfDay = (ms: number) => {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const daysOff = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000)
  if (daysOff <= 0) return ''
  if (daysOff === 1) return 'tomorrow'
  const day = new Date(at)
  if (daysOff < 7) return day.toLocaleDateString(undefined, { weekday: 'long' })
  return day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}
