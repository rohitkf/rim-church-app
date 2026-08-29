import { useEffect, useState, type ReactNode } from 'react'
import { countdownIsClockworthy, countdownParts } from '../lib/countdown'

/**
 * Time remaining until a service starts, as a live clock.
 *
 * Only shown inside the last day — beyond that a clock is noise, and the
 * date already says what the reader needs.
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
   * What to show when a clock would be noise — more than a day out, or no
   * start time recorded. Without it the hero tile is left with a hole in
   * the middle for six days of the week.
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

  const { hrs, mins, secs } = countdownParts(remaining)

  if (variant === 'hero') {
    return (
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1" aria-label={`Starts in ${hrs}:${mins}:${secs}`}>
        {/* The display size is 76px, which is eight monospace glyphs
            wider than a small phone. It scales with the viewport up to
            that, so the clock stays the biggest thing on the tile without
            pushing the page sideways. */}
        <span className="font-mono text-[clamp(44px,15vw,76px)] font-medium leading-none tracking-[-0.04em] tabular">
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
