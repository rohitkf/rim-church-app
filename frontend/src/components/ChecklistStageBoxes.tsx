import type { ChecklistItemStatus } from '../lib/types'

/** Where each box sits in the chain, and what ticking or unticking it means. */
const STAGES = [
  {
    key: 'member' as const,
    label: 'Done',
    title: 'Ticked by the volunteer holding the role',
    on: 'member_complete' as ChecklistItemStatus,
    off: 'pending' as ChecklistItemStatus,
    colour: 'border-status-member bg-status-member',
    text: 'text-status-member',
  },
  {
    key: 'head' as const,
    label: 'Head',
    title: 'Verified by the team head',
    on: 'head_verified' as ChecklistItemStatus,
    off: 'member_complete' as ChecklistItemStatus,
    colour: 'border-status-head bg-status-head',
    text: 'text-status-head',
  },
  {
    key: 'sign' as const,
    label: 'Sign-off',
    title: 'Signed off by Service Flow',
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
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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
