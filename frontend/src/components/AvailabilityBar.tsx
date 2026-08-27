import type { AvailabilitySummary } from '../lib/availabilitySummary'

/** Segmented availability bar: green available, amber tentative, red
 * unavailable, grey track for anyone yet to answer. Shared by the
 * Availability Tracker and the dashboard so both read the same. */
export function AvailabilityBar({ summary, label }: { summary: AvailabilitySummary; label: string }) {
  const width = (n: number) => `${summary.total > 0 ? (n / summary.total) * 100 : 0}%`

  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-surface-container"
      role="img"
      aria-label={`${label}: ${summary.pct}% available, ${summary.tentative} tentative, ${summary.noAnswer} yet to answer`}
    >
      <div className="bg-success" style={{ width: width(summary.available) }} />
      <div className="bg-warning" style={{ width: width(summary.tentative) }} />
      <div className="bg-error" style={{ width: width(summary.unavailable) }} />
    </div>
  )
}
