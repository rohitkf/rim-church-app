/*
 * When a finished event's registrations are cleared of people's details.
 *
 * Nothing deletes an event on its own. What does happen on its own is
 * `registration_anonymise()` (0245, 0287): every night, for each event
 * whose last date is more than `registration_retention_days` behind, the
 * name, email, phone number and attendee names on its registrations are
 * blanked, with the messages sent to its organisers and the receipts
 * people sent. The orders, their codes and the sums stay until somebody
 * deletes the event.
 *
 * The Owner asked (November 2026) for a countdown on a finished event, to
 * know how long is left. This is the sum the job does, done here, so the
 * page can say when: the number of days counted from the event's last
 * date, and then the next run of the job, which is at 03:35 UTC.
 * `registrationClearing.test.ts` holds the hour and the rule to the
 * migrations' own.
 */

/** When the nightly job runs, in UTC: `cron.schedule('registration-anonymise', '35 3 * * *', …)`. */
export const CLEARING_RUNS_AT = { hour: 3, minute: 35 } as const

const DAY = 86_400_000

/**
 * The moment an event's registrations are cleared: the first run of the
 * job after its last date is `keepDays` behind. Null when the church
 * keeps the details for ever, or the event has no date to count from.
 */
export function detailsClearAt(lastEndsAt: string | null | undefined, keepDays: number | null | undefined): Date | null {
  if (!lastEndsAt || keepDays === null || keepDays === undefined) return null
  const last = new Date(lastEndsAt).getTime()
  if (!Number.isFinite(last)) return null
  // The job clears an event once `last < now - keepDays`: strictly after this moment.
  const due = last + keepDays * DAY
  const day = new Date(due)
  let run = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), CLEARING_RUNS_AT.hour, CLEARING_RUNS_AT.minute)
  if (run <= due) run += DAY
  return new Date(run)
}

export type Clearing =
  /** The church keeps the details until the event is deleted. */
  | { state: 'kept' }
  /** Counting down to the night it happens. */
  | { state: 'counting'; at: Date }
  /** The night has come and the registrations still have names: the next run takes them. */
  | { state: 'due'; at: Date }
  /** Done: the registrations are there, with nobody's details on them. */
  | { state: 'cleared' }

/**
 * Where a finished event stands. Null for an event that has not finished
 * (or has no dates): the count starts from its last date, so there is
 * nothing to say before then.
 *
 * `cleared` is what the registrations themselves say (`anonymised_at`),
 * not the clock: an event with no registrations has nothing to clear, and
 * keeps counting to a night that changes nothing rather than claiming
 * something was removed.
 */
export function clearingOf(input: {
  lastEndsAt: string | null | undefined
  keepDays: number | null | undefined
  /** Whether any of its registrations has already been cleared. */
  anonymised: boolean
  now: Date
}): Clearing | null {
  const { lastEndsAt, keepDays, anonymised, now } = input
  if (!lastEndsAt) return null
  const last = new Date(lastEndsAt).getTime()
  if (!Number.isFinite(last) || last >= now.getTime()) return null
  if (anonymised) return { state: 'cleared' }
  const at = detailsClearAt(lastEndsAt, keepDays)
  if (!at) return { state: 'kept' }
  return at.getTime() > now.getTime() ? { state: 'counting', at } : { state: 'due', at }
}

/**
 * What is left, for a line on a card: "89 days 14 hrs", "14 hrs 05 min",
 * "12 min". Two parts at most: a card is glanced at, and the seconds are
 * on the event's own page.
 */
export function clearingLeft(at: Date, now: Date): string {
  const total = Math.max(0, Math.floor((at.getTime() - now.getTime()) / 60_000))
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} ${hours === 1 ? 'hr' : 'hrs'}`
  if (hours > 0) return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${String(minutes).padStart(2, '0')} min`
  return minutes > 0 ? `${minutes} min` : 'under a minute'
}

/** The line on an event's card, or null where there is nothing worth a line. */
export function clearingLine(clearing: Clearing | null, now: Date): string | null {
  if (!clearing) return null
  switch (clearing.state) {
    case 'counting':
      return `Names and contact details removed in ${clearingLeft(clearing.at, now)}`
    case 'due':
      return 'Names and contact details removed tonight'
    case 'cleared':
      return 'Names and contact details removed'
    case 'kept':
      // Nothing is counting down: the Settings page says so, not every card.
      return null
  }
}

/** "20 February 2027": the night it happens, as a date in the reader's own time. */
export function clearingDay(at: Date): string {
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
