import { formatServiceDay } from '../lib/sunday'

/**
 * The day a run of services belongs to.
 *
 * Said once, above them, rather than repeated on each card: two services
 * on one Sunday are one occasion to answer for, and a page that repeats
 * "Sunday, 6 September 2026" under every service reads as six mornings
 * where there are three.
 */
export function DayHeading({
  date,
  today,
  count,
}: {
  date: string
  today: string
  count: number
}) {
  return (
    // In the app's own type, not spaced capitals: "TODAY · SUNDAY,
    // SEPTEMBER 27, 2026" in mono was wider than a phone and broke over two
    // lines. The day is the heading; how many services it holds sits beside.
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <h2 className="min-w-0 text-body-lg font-semibold text-on-surface">
        {date === today ? `Today, ${formatServiceDay(date)}` : formatServiceDay(date)}
      </h2>
      <span className="shrink-0 text-label-md text-on-surface-variant">
        {count} {count === 1 ? 'service' : 'services'}
      </span>
    </div>
  )
}
