import type { ChecklistItemStatus } from '../lib/types'

export const statusLabel: Record<ChecklistItemStatus, string> = {
  pending: 'Pending',
  member_complete: 'Member Complete',
  head_verified: 'Head Verified',
  coordinator_verified: 'Coordinator Verified',
}

const statusBadgeClasses: Record<ChecklistItemStatus, string> = {
  pending: 'bg-status-pending/15 text-status-pending',
  member_complete: 'bg-status-member/15 text-status-member',
  head_verified: 'bg-status-head/15 text-status-head',
  coordinator_verified: 'bg-status-coordinator/15 text-status-coordinator',
}

export function StatusBadge({ status }: { status: ChecklistItemStatus }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${statusBadgeClasses[status]}`}
    >
      {statusLabel[status]}
    </span>
  )
}

const barColor: Record<Exclude<ChecklistItemStatus, 'pending'>, string> = {
  member_complete: 'bg-status-member',
  head_verified: 'bg-status-head',
  coordinator_verified: 'bg-status-coordinator',
}

interface SegmentedProgressBarProps {
  total: number
  memberComplete: number
  headVerified: number
  coordinatorVerified: number
  /** Off for the small per-department bars, where repeating the three
   * stage percentages under every row is what makes a list unreadable. */
  showLegend?: boolean
}

/** Status-driven progress bar (DESIGN.md §2): each stage's share of the
 * total renders as its own colored segment on a shared track. */
export function SegmentedProgressBar({
  total,
  memberComplete,
  headVerified,
  coordinatorVerified,
  showLegend = true,
}: SegmentedProgressBarProps) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  const pending = total - memberComplete - headVerified - coordinatorVerified

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container">
        <div className={barColor.member_complete} style={{ width: `${pct(memberComplete)}%` }} />
        <div className={barColor.head_verified} style={{ width: `${pct(headVerified)}%` }} />
        <div className={barColor.coordinator_verified} style={{ width: `${pct(coordinatorVerified)}%` }} />
      </div>
      {showLegend && (
      <div className="mt-3 flex flex-wrap gap-4 font-mono text-label-sm text-on-surface-variant">
        <span>
          <span className="text-status-coordinator">{Math.round(pct(coordinatorVerified))}%</span> Verified
        </span>
        <span>
          <span className="text-status-head">{Math.round(pct(headVerified))}%</span> Checked
        </span>
        <span>
          <span className="text-status-pending">{Math.round(pct(pending))}%</span> Pending
        </span>
      </div>
      )}
    </div>
  )
}
