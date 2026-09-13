/**
 * Split a duration into the clock parts a countdown shows.
 *
 * Whole days come out separately rather than piling into the hours. A
 * six-day wait is "6d 14:22:31"; nobody reads "158:22:31".
 */
export function countdownParts(ms: number): {
  days: number
  hrs: string
  mins: string
  secs: string
} {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    days: Math.floor(total / 86400),
    hrs: pad(Math.floor((total % 86400) / 3600)),
    mins: pad(Math.floor((total % 3600) / 60)),
    secs: pad(total % 60),
  }
}

/** Past this the clock is meaningless and the date is the better answer. */
const CLOCK_LIMIT_MS = 100 * 24 * 60 * 60 * 1000

/**
 * Whether a clock is the right way to say how far off a service is.
 *
 * This used to stop at a day, on the reasoning that a clock is noise
 * further out than that. It is not: the moment the last service of the day
 * ends, the next one is the thing the church is working towards, and a
 * running clock is exactly what says so — even when it reads six days.
 * Only an absurd distance falls back to the date.
 */
export function countdownIsClockworthy(ms: number): boolean {
  return ms > 0 && ms < CLOCK_LIMIT_MS
}

/**
 * A countdown short enough for the timeline rail, where the column is 56px
 * on a phone.
 *
 * "01:29:14" is eight glyphs of precision nobody standing at the back of a
 * room needs. The unit that matters changes as the gap closes — hours and
 * minutes while there is time to plan, minutes and seconds once it is
 * close, and bare seconds at the end, which is when a second is worth
 * showing at all.
 */
export function formatCountdown(ms: number): string {
  const total = Math.floor(ms / 1000)
  if (total <= 0) return 'due'
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hrs > 0) return `${hrs}h ${mins}m`
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`
  return `${secs}s`
}

/**
 * The moment a countdown runs out, in words.
 *
 * A clock says how long is left and never says when that is, so somebody
 * reading "6d 00:00:28 to answer" has to do arithmetic to find out whether
 * that is Saturday night or Sunday morning — and then trust it. The
 * deadline itself is the thing people plan around: "closes 11:59pm Sat"
 * can be acted on without counting.
 *
 * Today is said as a time alone, because the day is not in question. Inside
 * the week ahead it takes a weekday. Beyond that it takes a date, since
 * "Sat" a fortnight out is the wrong Saturday.
 */
export function momentLabel(iso: string, now: number = Date.now()): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null

  const time = at
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
    .replace(/\s/g, '')

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const daysOff = Math.round((startOfDay(at) - startOfDay(new Date(now))) / 86_400_000)

  if (daysOff === 0) return time
  if (daysOff === 1) return `${time} tomorrow`
  if (daysOff > 1 && daysOff < 7) {
    return `${time} ${at.toLocaleDateString(undefined, { weekday: 'short' })}`
  }
  return `${time}, ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}
