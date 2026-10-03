import { useEffect, useState } from 'react'
import { useAppSettings, useDisplay } from '../lib/appSettings'
import { formatCountdown } from '../lib/boardClear'
import { lifespanOf, type LifespanPage } from '../lib/lifespan'

/**
 * How long this page's contents last, in one line under its title.
 *
 * The same strip on every page that has a clock, so "does this go away,
 * and when?" is answered in the same place wherever somebody asks it.
 * With `until`, it counts down to the moment as well.
 */
export function Lifespan({
  page,
  until,
  className = '',
}: {
  page: LifespanPage
  /** A moment to count down to — the next clear, say. */
  until?: Date
  className?: string
}) {
  const settings = useAppSettings()
  const setListDays = useDisplay().windows.setListDays
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [until])

  return (
    <p
      className={`flex items-start gap-2 rounded-[var(--radius-chip)] bg-surface-lowest px-3.5 py-2.5 text-label-md text-on-surface-variant hairline ${className}`}
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-faint"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M9 2h6" />
      </svg>
      <span className="min-w-0">
        {until && (
          <>
            Clears in{' '}
            <span className="font-mono font-medium text-on-surface">
              {formatCountdown(until.getTime() - now)}
            </span>
            .{' '}
          </>
        )}
        {lifespanOf(page, { ...settings, set_list_days: setListDays }, new Date(now))}
      </span>
    </p>
  )
}
