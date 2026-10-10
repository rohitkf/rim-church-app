/**
 * When things go, said the same way on every page.
 *
 * Church Updates end, polls clear, settled feedback and finished services
 * are deleted on a clock (0128). The database does the deleting; these
 * only say when, so a card can carry "Ends in 3 days" without each page
 * inventing its own wording.
 */

const DAY = 86_400_000

/** A Date as the value a date-and-time field holds: "2026-11-09T18:30", in local time. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `days` after `from`, at the same wall-clock time. */
export function daysAfter(from: Date, days: number): Date {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * "in 30 days", "in 5 hours", "in 12 minutes" — the largest unit that
 * still says something. Days are to the nearest day (a month ahead reads
 * "30 days", not "29" a second after it was set); hours and minutes round
 * down, where the difference matters. "now" once it has passed.
 */
export function untilText(at: string | Date, now: number): string {
  const ms = new Date(at).getTime() - now
  if (ms <= 60_000) return 'now'
  if (ms >= 2 * DAY) return `in ${Math.round(ms / DAY)} days`
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 2) return `in ${hours} hours`
  if (hours === 1) return 'in 1 hour'
  const mins = Math.floor(ms / 60_000)
  return `in ${mins} ${mins === 1 ? 'minute' : 'minutes'}`
}

/**
 * When a poll clears if its asker does not choose: `days` after its
 * deadline, or after now if it has none — the same rule as the
 * database's poll_default_clear() (0128).
 */
export function defaultPollClear(closesAt: string, now: Date, days: number): string {
  const from = closesAt ? new Date(closesAt) : now
  return toLocalInput(daysAfter(from, days))
}

/**
 * Whether a poll's clear time can be saved: after now, and not before
 * its deadline (team_polls_clears_after_closing).
 */
export function pollClearProblem(closesAt: string, clearsAt: string, now: number): string | null {
  if (!clearsAt) return 'Choose when the poll clears.'
  const clears = new Date(clearsAt).getTime()
  if (clears <= now) return 'The clear time has to be in the future.'
  if (closesAt && clears < new Date(closesAt).getTime()) return 'A poll can’t clear before its deadline.'
  return null
}

/** Whether a Church Update's end time can be saved — the same limits as post_church_update(). */
export function updateEndProblem(endsAt: string, now: number): string | null {
  if (!endsAt) return 'Choose when the update ends.'
  const ends = new Date(endsAt).getTime()
  if (ends <= now) return 'The end time has to be in the future.'
  if (ends > now + 366 * DAY) return 'An update can run for a year at most.'
  return null
}

/** The moment a finished service is deleted: `days` after its date, at the start of the next day. */
export function serviceGoneAt(serviceDate: string, days: number): Date {
  const d = new Date(`${serviceDate}T00:00:00`)
  d.setDate(d.getDate() + days + 1)
  return d
}

/** The moment settled feedback is deleted, or null if it is kept for ever or still open. */
export function feedbackGoneAt(settledAt: string | null, days: number | null): Date | null {
  if (!settledAt || days === null) return null
  return new Date(new Date(settledAt).getTime() + days * DAY)
}
