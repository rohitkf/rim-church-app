import type { ReactNode } from 'react'
import { useTeamStyle } from '../lib/useTeamStyle'
import { teamAvatarStyle, teamChipStyle, teamColorOf, teamSpine } from '../lib/teamGradient'

/**
 * The mark that says which team something belongs to.
 *
 * In dot mode it is the 10px circle the app has always used. In gradient
 * mode it becomes a spine — a vertical bar, full colour at the top and
 * fading down — which is the same information given more of the row to
 * live in. Everywhere a team is named, this is what sits beside the name,
 * so the two views can never drift apart into a per-page decision.
 */
export function TeamMark({ color, className = '' }: { color: string | null; className?: string }) {
  const { teamStyle } = useTeamStyle()

  if (teamStyle === 'gradient') {
    return (
      <span
        className={`h-7 w-[6px] shrink-0 rounded-full ${className}`}
        style={teamSpine(color)}
        aria-hidden="true"
      />
    )
  }

  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: teamColorOf(color) }}
      aria-hidden="true"
    />
  )
}

/** A team's initials on its own colour: a tint behind them, or the colour itself. */
export function TeamAvatar({
  color,
  name,
  className = '',
}: {
  color: string | null
  name: string
  className?: string
}) {
  const { teamStyle } = useTeamStyle()

  return (
    <span
      className={`flex items-center justify-center font-mono ${className}`}
      style={teamAvatarStyle(color, teamStyle)}
      aria-hidden="true"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

/** A team's name as a chip, for where the team is a tag rather than the subject. */
export function TeamChip({
  color,
  children,
  className = '',
}: {
  color: string | null
  children: ReactNode
  className?: string
}) {
  const { teamStyle } = useTeamStyle()

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-label-sm ${className}`}
      style={teamChipStyle(color, teamStyle)}
    >
      {children}
    </span>
  )
}
