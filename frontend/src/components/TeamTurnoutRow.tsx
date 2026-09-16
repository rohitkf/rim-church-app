import { Link } from 'react-router-dom'
import type { TurnoutRing } from '../lib/teamTurnout'

/**
 * A team's availability as a small ring — the same shape as the readiness
 * ring so the two read as one family, at the size a row can carry.
 */
function TeamRing({ pct, color }: { pct: number; color: string }) {
  const size = 44
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (Math.min(Math.max(pct, 0), 100) / 100) * circumference

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-raised-strong"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </g>
    </svg>
  )
}


/**
 * One team's line in Teams on duty.
 *
 * Two figures live here across the week: what the team said it would do,
 * and what it did. The caption carries whichever one is current and the
 * line under it carries the people behind that number, so the row reads
 * the same whether it is Wednesday or ten past nine on Sunday.
 */
export function TeamTurnoutRow({ name, ring }: { name: string; ring: TurnoutRing }) {
  return (
    <Link
      to="/availability"
      className="flex items-center gap-3.5 rounded-[var(--radius-row)] bg-raised px-4 py-3.5 hairline transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised-strong"
    >
      <TeamRing pct={ring.pct} color={ring.color} />
      <span className="min-w-0">
        <span className="block break-words text-body-sm font-medium text-on-surface">{name}</span>
        <span className="block font-mono text-label-sm text-on-surface-variant">
          {ring.caption}
        </span>
        <span className="block font-mono text-label-sm text-on-surface-faint">{ring.detail}</span>
      </span>
    </Link>
  )
}
