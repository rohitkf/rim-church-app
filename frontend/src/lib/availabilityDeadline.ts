/**
 * When an answer stops counting.
 *
 * "Can you serve on Sunday?" is asked so a rota can be built out of the
 * answers, and it used to stay open until the service itself began — so
 * somebody could mark themselves unavailable at 09:59 for a service at
 * 10:00 and be, as far as the app was concerned, in time. That is not a
 * deadline; it is the moment the head is already standing in the hall
 * counting heads.
 *
 * The answer is due the night before: 23:59 by default, on the day before
 * the service. The time is a setting (App settings), and so is the
 * timezone it is read on — "23:59" is not a moment until somebody says
 * where, and the database has to agree with the page about which moment
 * it was. See migration 0092, which enforces the same rule.
 */

/**
 * How far a zone's wall clock is from UTC at a given instant.
 *
 * Formatting the instant in the zone and reading the result back as if it
 * were UTC gives the offset without a timezone library — and gets British
 * Summer Time right, which is the whole reason this cannot be a constant.
 */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    // Some engines render midnight as hour 24 rather than 0.
    read('hour') % 24,
    read('minute'),
    read('second'),
  )
  return asIfUtc - instant.getTime()
}

/**
 * The last moment an answer counts, for a service on `serviceDate`.
 *
 * `serviceDate` is a plain date — 2026-09-13 — and `closesTime` a wall
 * clock — 23:59. The answer is the instant those mean in the church's
 * zone, on the day before.
 */
export function availabilityClosesAt(
  serviceDate: string,
  closesTime: string | null | undefined,
  timeZone: string | null | undefined,
): Date {
  const [year, month, day] = serviceDate.split('-').map(Number)
  /*
   * Both settings have a working answer if they are missing.
   *
   * A deadline is not the place to throw: a build reading a settings row
   * older than itself, or one whose row has gone, should still put the
   * cut-off where it shipped rather than take the page down with it.
   */
  const [hours, minutes] = (closesTime?.trim() || '23:59').split(':').map(Number)
  const zone = timeZone?.trim() || 'Europe/London'

  // Day zero is the last day of the month before, which is exactly what
  // "the night before the first" should mean.
  const wall = Date.UTC(year, month - 1, day - 1, hours, minutes)

  /*
   * Guess, then correct.
   *
   * The offset has to be sampled at the instant we land on rather than
   * the one we started from: on the night the clocks change those are an
   * hour apart, and a single pass would put the deadline in the wrong
   * hour on exactly the night somebody is most likely to be confused.
   */
  const guess = wall - offsetAt(new Date(wall), zone)
  return new Date(wall - offsetAt(new Date(guess), zone))
}

/** Whether that moment has gone. */
export function answersAreClosed(
  serviceDate: string,
  closesTime: string | null | undefined,
  timeZone: string | null | undefined,
  now: number = Date.now(),
): boolean {
  return availabilityClosesAt(serviceDate, closesTime, timeZone).getTime() <= now
}
