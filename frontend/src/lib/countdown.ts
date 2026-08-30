/** Split a duration into the clock parts a countdown shows. */
export function countdownParts(ms: number): { hrs: string; mins: string; secs: string } {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    hrs: pad(Math.floor(total / 3600)),
    mins: pad(Math.floor((total % 3600) / 60)),
    secs: pad(total % 60),
  }
}

/**
 * How far off a service is, in words, once it is too far away for a clock
 * to mean anything: nobody reads "73:14:02".
 */
export function countdownIsClockworthy(ms: number): boolean {
  return ms > 0 && ms < 24 * 60 * 60 * 1000
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
