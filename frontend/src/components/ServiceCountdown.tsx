import { useEffect, useState, type ReactNode } from 'react'
import { countdownIsClockworthy, countdownParts } from '../lib/countdown'

/**
 * Time remaining until a service starts, as a live clock.
 *
 * It runs however far out the service is, days included: once the day's
 * services are over, the next one is what the week is pointing at, and a
 * clock that only appears in the last twenty-four hours leaves the page
 * saying nothing for six days out of seven.
 */
export function ServiceCountdown({
  startsAt,
  variant = 'inline',
  fallback,
}: {
  startsAt: string | null
  /** `hero` is the dashboard's headline clock; `inline` is a line of text. */
  variant?: 'inline' | 'hero'
  /**
   * What to show when there is no clock to run — no running order on the
   * service yet, so no start time to count towards.
   */
  fallback?: ReactNode
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!startsAt) return fallback ?? null
  const remaining = new Date(startsAt).getTime() - now
  if (!countdownIsClockworthy(remaining)) return fallback ?? null

  const { days, hrs, mins, secs } = countdownParts(remaining)
  const spoken = `Starts in ${days > 0 ? `${days} days ` : ''}${hrs}:${mins}:${secs}`

  if (variant === 'hero') {
    return (
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1" aria-label={spoken}>
        {/* The display size is 76px, which is eight monospace glyphs
            wider than a small phone. It scales with the viewport up to
            that, so the clock stays the biggest thing on the tile without
            pushing the page sideways. Days ride in front at a smaller
            size: they are the part that changes once a week, and giving
            them the display size would push the clock off a phone. */}
        <span className="font-mono text-[clamp(44px,15vw,76px)] font-medium leading-none tracking-[-0.04em] tabular">
          {days > 0 && (
            <span className="mr-2 text-[0.5em] text-on-surface-variant">{days}d</span>
          )}
          {hrs}
          <span className="text-on-surface-faint/50">:</span>
          {mins}
          <span className="text-on-surface-faint/50">:</span>
          <span className="text-primary">{secs}</span>
        </span>
        <span className="pb-3 font-mono text-eyebrow uppercase text-on-surface-faint">
          until doors
        </span>
      </div>
    )
  }

  return (
    <span className="flex items-baseline gap-1.5" aria-label={spoken}>
      <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
        Starts in
      </span>
      <span className="font-mono text-body-md tabular-nums text-on-surface">
        {days > 0 && <span className="mr-1 text-on-surface-variant">{days}d</span>}
        {hrs}
        <span className="text-on-surface-variant">:</span>
        {mins}
        <span className="text-on-surface-variant">:</span>
        <span className="text-primary">{secs}</span>
      </span>
    </span>
  )
}
