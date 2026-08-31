/**
 * When the week turns over.
 *
 * The message board empties every Tuesday at 00:00 UTC — two days after
 * Sunday, so the week's posts outlive the service they were about and then
 * go. The planner's finished list keeps the same clock, because a person
 * shouldn't have to learn two different weeks: whatever "this week" means
 * on the board, it means here too.
 *
 * UTC rather than local time, deliberately — the board's cron runs on the
 * server, and a list that emptied an hour before or after it would look
 * like a bug rather than a boundary.
 */

/** Which day the week turns over on, unless Settings says otherwise. */
export const DEFAULT_CLEAR_DOW = 2

/** The most recent clear-day 00:00 UTC, as epoch milliseconds. */
export function lastWeeklyClear(now: Date = new Date(), dow: number = DEFAULT_CLEAR_DOW): number {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const day = new Date(midnight).getUTCDay() // 0 Sunday … 6 Saturday
  // On the day itself the boundary is this morning, not a week ago.
  const daysBack = (day - dow + 7) % 7
  return midnight - daysBack * 86_400_000
}

/** That same moment as a date, for filtering rows stored by day. */
export function lastWeeklyClearDate(now: Date = new Date(), dow: number = DEFAULT_CLEAR_DOW): string {
  return new Date(lastWeeklyClear(now, dow)).toISOString().slice(0, 10)
}
