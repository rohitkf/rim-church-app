import type { ChecklistItemStatus } from '../lib/types'

/** Where each box sits in the chain, and what ticking or unticking it means. */
const STAGES = [
  {
    key: 'member' as const,
    label: 'Done',
    title: 'Ticked by the volunteer holding the role',
    who: 'The volunteer on the role ticks it when it is done.',
    on: 'member_complete' as ChecklistItemStatus,
    off: 'pending' as ChecklistItemStatus,
    colour: 'border-status-member bg-status-member',
    text: 'text-status-member',
  },
  {
    key: 'head' as const,
    // The team's Head, or its Team Coordinator: either may verify.
    label: 'Head/Coordinator',
    title: 'Verified by the team head or the team coordinator',
    who: 'The team’s Head, Assisting Head or Team Coordinator checks it. Admins can too.',
    on: 'head_verified' as ChecklistItemStatus,
    off: 'member_complete' as ChecklistItemStatus,
    colour: 'border-status-head bg-status-head',
    text: 'text-status-head',
  },
  {
    key: 'sign' as const,
    label: 'Sign-off',
    title: 'Signed off by Service Flow',
    who: 'Service Flow gives the final sign-off for every team.',
    on: 'coordinator_verified' as ChecklistItemStatus,
    off: 'head_verified' as ChecklistItemStatus,
    colour: 'border-status-coordinator bg-status-coordinator',
    text: 'text-status-coordinator',
  },
]

const RANK: Record<ChecklistItemStatus, number> = {
  pending: 0,
  member_complete: 1,
  head_verified: 2,
  coordinator_verified: 3,
}

interface ChecklistStageBoxesProps {
  status: ChecklistItemStatus
  /** What this viewer is allowed to sign, by stage. */
  may: { member: boolean; head: boolean; sign: boolean }
  onChange: (next: ChecklistItemStatus) => void
  busy?: boolean
}

/**
 * The three signatures an item collects, as boxes rather than a single
 * "next step" button.
 *
 * A box is live only for the person whose signature it is, and only while
 * it is the top of the chain — so each stage can be taken back by whoever
 * set it, and nobody can disturb a stage underneath one that is already
 * signed. A volunteer's mis-tap is theirs to undo until their head
 * verifies; after that the head has to untick first.
 */
export function ChecklistStageBoxes({ status, may, onChange, busy }: ChecklistStageBoxesProps) {
  const rank = RANK[status]

  return (
    // Free to wrap: with "Head/Coordinator" the three no longer fit
    // beside each other on a small phone, and a row that would not shrink
    // pushed Sign-off off the edge.
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
      {STAGES.map((stage, i) => {
        const checked = rank >= i + 1
        // Live only at the frontier: tick the next stage, or untick the last
        // one set. Anything deeper is locked by the stage above it.
        const editable = may[stage.key] && (checked ? rank === i + 1 : rank === i)
        const locked = checked && !editable

        return (
          <label
            key={stage.key}
            title={
              editable
                ? stage.title
                : locked
                  ? `${stage.title} — undo the stage after it first`
                  : `${stage.title} — waiting on the stage before it`
            }
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-label-sm transition-colors ${
              checked
                ? `${stage.colour} text-white`
                : editable
                  ? 'border-border-subtle bg-surface-lowest text-on-surface hover:border-secondary'
                  : 'border-border-subtle bg-surface-low text-on-surface-variant'
            } ${editable && !busy ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!editable || !!busy}
              onChange={() => onChange(checked ? stage.off : stage.on)}
              className="h-3.5 w-3.5 accent-white"
            />
            {stage.label}
          </label>
        )
      })}
    </div>
  )
}

/**
 * Who ticks which box, said once at the top of the page, so nobody waits
 * on a box that is somebody else's to tick.
 */
export function ChecklistStageLegend({ className = '' }: { className?: string }) {
  return (
    <ul aria-label="Who ticks each box" className={`flex flex-col gap-1.5 text-body-sm text-on-surface-variant ${className}`}>
      {STAGES.map((stage) => (
        <li key={stage.key} className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 font-mono text-label-sm text-white ${stage.colour}`}
          >
            {stage.label}
          </span>
          <span className="min-w-0">{stage.who}</span>
        </li>
      ))}
    </ul>
  )
}
