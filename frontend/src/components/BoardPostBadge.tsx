import type { MessageRow } from '../lib/types'
import { teamChipStyle } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'

const chip = 'rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide'

/**
 * Who a board post speaks for: its team, or — for a post with no team —
 * what it was made as, which the database wrote when it was posted (0188).
 *
 * An Admin speaks for the church. Overwatch speaks as itself, and is drawn
 * apart from an Admin: it reads every team and runs none (0187). A post
 * with no team by anybody else wears no badge rather than a wrong one.
 */
export function BoardPostBadge({ message }: { message: Pick<MessageRow, 'department' | 'posted_as'> }) {
  const { teamStyle } = useTeamStyle()

  if (message.department) {
    return (
      <span className={chip} style={teamChipStyle(message.department.color, teamStyle)}>
        {message.department.name}
      </span>
    )
  }
  if (message.posted_as === 'admin') return <span className={`${chip} bg-primary text-on-primary`}>Admin</span>
  if (message.posted_as === 'overwatch') {
    return <span className={`${chip} bg-raised text-on-surface hairline`}>Overwatch</span>
  }
  return null
}
