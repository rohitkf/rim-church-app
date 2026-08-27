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
