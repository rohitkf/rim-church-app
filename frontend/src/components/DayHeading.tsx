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
    // Wraps rather than holding its width: "TODAY · SUNDAY, SEPTEMBER 27,
    // 2026" in spaced capitals is wider than a 360px phone, and held on one
    // line it pushed the whole page sideways.
    <div className="flex items-baseline gap-3">
      <h2 className="min-w-0 break-words font-mono text-label-md uppercase tracking-[0.14em] text-on-surface">
        {date === today ? `Today · ${formatServiceDay(date)}` : formatServiceDay(date)}
      </h2>
      <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-border-subtle" />
      <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">
        {count} {count === 1 ? 'service' : 'services'}
      </span>
    </div>
  )
}
