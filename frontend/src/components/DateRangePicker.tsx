import { useMemo, useState } from 'react'
import { monthGrid, monthTitle, todayIso } from '../lib/monthGrid'
import { addDays, dayCount, formatRange, isWithin } from '../lib/dateRange'

/**
 * Picking a day, or a run of them.
 *
 * The browser's own date field was doing this, and on a phone that is a
 * spinning wheel in a grey sheet: you cannot see which day is a Saturday,
 * you cannot see the month around it, and there is nowhere to say "and the
 * two days after". A church diary is full of things that run — a
 * conference over a weekend, a week of prayer, a workday and its follow-up —
 * so the calendar is drawn here, in the app's own hand.
 *
 * The interaction is the one people already know from booking a hotel: the
 * first press sets the start, the second sets the end, and a press before
 * the start starts again from there rather than refusing. Nothing has to be
 * dragged, because a drag is the one gesture that does not survive being
 * done with a thumb on a moving bus.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  label = 'Date',
  today = todayIso(),
}: {
  from: string
  /** Null for a single day, which is most of them. */
  to: string | null
  onChange: (next: { from: string; to: string | null }) => void
  label?: string
  today?: string
}) {
  const anchor = from || today
  const [cursor, setCursor] = useState(() => ({
    year: Number(anchor.slice(0, 4)),
    month: Number(anchor.slice(5, 7)) - 1,
  }))
  // The day under the pointer while a range is half-made, so the run can be
  // seen before it is committed.
  const [hovered, setHovered] = useState<string | null>(null)
  /** Half-made: a start is set and the next press is the end. */
  const [choosingEnd, setChoosingEnd] = useState(false)

  const weeks = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const at = new Date(year, month + delta, 1)
      return { year: at.getFullYear(), month: at.getMonth() }
    })

  // What to paint: the settled range, or the one being drawn.
  const previewTo = choosingEnd && hovered && hovered > from ? hovered : to
  const runTo = previewTo && previewTo > from ? previewTo : null

  function press(iso: string) {
    if (!from || (!choosingEnd && !to)) {
      // Nothing chosen yet, or a single day that is being replaced.
      onChange({ from: iso, to: null })
      setChoosingEnd(true)
      return
    }
    if (choosingEnd) {
      if (iso < from) {
        // Pressing before the start is somebody correcting the start, not
        // asking for a backwards range.
        onChange({ from: iso, to: null })
        return
      }
      onChange({ from, to: iso === from ? null : iso })
      setChoosingEnd(false)
      return
    }
    onChange({ from: iso, to: null })
    setChoosingEnd(true)
  }

  const days = to ? dayCount(from, to) : 1

  return (
    <div className="rounded-[var(--radius-card)] bg-inset p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="tap flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-raised-strong hover:text-on-surface"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div aria-live="polite" className="text-body-sm font-medium text-on-surface">
          {monthTitle(cursor.year, cursor.month)}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="tap flex h-8 w-8 items-center justify-center rounded-full text-on-surface-variant hover:bg-raised-strong hover:text-on-surface"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5 font-mono text-label-sm text-on-surface-faint">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <div key={d} className="py-1 text-center">
            {d}
          </div>
        ))}
      </div>

      <div
        role="grid"
        aria-label={label}
        className="grid grid-cols-7 gap-y-0.5"
        onMouseLeave={() => setHovered(null)}
      >
        {weeks.flat().map((cell) => {
          const isStart = cell.iso === from
          const isEnd = !!to && cell.iso === to
          const inRun = !!runTo && isWithin(cell.iso, from, runTo)
          const isToday = cell.iso === today
          // The ends are solid; the days between are a wash, so a run reads
          // as one object rather than as a row of separate choices.
          const tone = isStart || isEnd
            ? 'bg-primary text-on-primary font-semibold'
            : inRun
              ? 'bg-[color-mix(in_oklab,var(--color-primary)_38%,var(--color-surface-lowest))] text-on-surface'
              : cell.inMonth
                ? 'text-on-surface hover:bg-raised-strong'
                : 'text-on-surface-faint hover:bg-raised'
          /*
           * A run is one object, so only its outer corners are round: the
           * days between square off and butt together into a bar. Rounded
           * on every side, three days read as three separate choices that
           * happen to be next to each other.
           */
          const inMiddle = inRun && !isStart && !isEnd
          const hasRun = !!runTo
          const corners = !hasRun || (isStart && isEnd)
            ? 'rounded-[var(--radius-chip)]'
            : isStart
              ? 'rounded-l-[var(--radius-chip)]'
              : cell.iso === runTo
                ? 'rounded-r-[var(--radius-chip)]'
                : inMiddle
                  ? ''
                  : 'rounded-[var(--radius-chip)]'
          return (
            <button
              key={cell.iso}
              type="button"
              role="gridcell"
              aria-label={cell.iso}
              aria-pressed={isStart || isEnd || inRun}
              onMouseEnter={() => setHovered(cell.iso)}
              onFocus={() => setHovered(cell.iso)}
              onClick={() => press(cell.iso)}
              className={`relative h-10 text-body-sm transition-colors duration-200 ${corners} ${tone} ${
                isToday && !isStart && !isEnd ? 'ring-1 ring-secondary/60' : ''
              }`}
            >
              {cell.day}
            </button>
          )
        })}
      </div>

      {/* What has actually been chosen, said in words — a grid of tinted
          squares is easy to misread by one day. */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-label-md text-on-surface">
          {formatRange(from, to, today)}
          {days > 1 && <span className="text-on-surface-faint"> · {days} days</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {to ? (
            <button
              type="button"
              onClick={() => {
                onChange({ from, to: null })
                setChoosingEnd(false)
              }}
              className="tap rounded-full px-3 py-1.5 text-label-sm text-on-surface-variant hairline hover:border-secondary"
            >
              Just one day
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onChange({ from, to: addDays(from, 1) })
                setChoosingEnd(false)
              }}
              className="tap rounded-full px-3 py-1.5 text-label-sm text-on-surface-variant hairline hover:border-secondary"
            >
              Add an end date
            </button>
          )}
        </div>
      </div>
      {choosingEnd && !to && (
        <p className="mt-1 text-label-sm text-on-surface-faint">
          Press another day if it runs on, or leave it for a single day.
        </p>
      )}
    </div>
  )
}
