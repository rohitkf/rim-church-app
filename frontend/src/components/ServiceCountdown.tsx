import { useEffect, useState } from 'react'
import { countdownIsClockworthy, countdownParts } from '../lib/countdown'

/**
 * Time remaining until a service starts, as a live clock.
 *
 * Only shown inside the last day — beyond that a clock is noise, and the
 * date already says what the reader needs.
 */
export function ServiceCountdown({ startsAt }: { startsAt: string | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!startsAt) return null
  const remaining = new Date(startsAt).getTime() - now
  if (!countdownIsClockworthy(remaining)) return null

  const { hrs, mins, secs } = countdownParts(remaining)

  return (
    <span className="flex items-baseline gap-1.5" aria-label={`Starts in ${hrs}:${mins}:${secs}`}>
      <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
        Starts in
      </span>
      <span className="font-mono text-body-md tabular-nums text-on-surface">
        {hrs}
        <span className="text-on-surface-variant">:</span>
        {mins}
        <span className="text-on-surface-variant">:</span>
        <span className="text-primary">{secs}</span>
      </span>
    </span>
  )
}
