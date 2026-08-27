import type { Readiness } from '../lib/readiness'

interface ReadinessDonutProps {
  readiness: Readiness
  /** Outer diameter in px. */
  size?: number
  label?: string
}

const STAGE_COLORS: { key: 'coordinatorVerified' | 'headVerified' | 'memberComplete'; color: string }[] = [
  // Drawn outermost-first around the ring: signed off, then head-verified,
  // then member-checked, so the arc reads as progress through the stages.
  { key: 'coordinatorVerified', color: 'var(--color-status-coordinator)' },
  { key: 'headVerified', color: 'var(--color-status-head)' },
  { key: 'memberComplete', color: 'var(--color-status-member)' },
]

/**
 * Readiness as a ring, with the weighted percentage in the middle.
 *
 * The ring is segmented by stage rather than being one solid arc: the same
 * 60% looks very different when it is everything member-checked and nothing
 * verified. A 2px gap separates neighbouring segments so they stay countable
 * where two colours meet, and the counts are written out beneath the chart
 * so the reading never depends on telling the colours apart.
 */
export function ReadinessDonut({ readiness, size = 128, label }: ReadinessDonutProps) {
  const stroke = Math.max(8, Math.round(size * 0.11))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const gap = readiness.total > 1 ? 2 : 0

  let offset = 0
  const segments = STAGE_COLORS.flatMap(({ key, color }) => {
    const count = readiness[key]
    if (!count || !readiness.total) return []
    const length = (count / readiness.total) * circumference
    const seg = { color, length: Math.max(length - gap, 0.5), start: offset }
    offset += length
    return [seg]
  })

  return (
    <figure className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ? `${label}: ` : ''}${
          readiness.pct === null ? 'nothing to check' : `${readiness.pct}% ready`
        }, ${readiness.coordinatorVerified} of ${readiness.total} signed off`}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-surface-container"
          />
          {segments.map((seg) => (
            <circle
              key={seg.color}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.start}
            />
          ))}
        </g>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-on-surface font-mono"
          style={{ fontSize: size * 0.26, fontWeight: 500 }}
        >
          {readiness.pct === null ? '—' : `${readiness.pct}%`}
        </text>
      </svg>
      {label && (
        <figcaption className="max-w-32 text-center text-body-sm text-on-surface">{label}</figcaption>
      )}
    </figure>
  )
}

/** Shared key for a group of donuts — identity never rests on colour alone. */
export function ReadinessLegend({ readiness }: { readiness: Readiness }) {
  const entries = [
    { label: 'Signed off', value: readiness.coordinatorVerified, color: 'bg-status-coordinator' },
    { label: 'Head verified', value: readiness.headVerified, color: 'bg-status-head' },
    { label: 'Checked', value: readiness.memberComplete, color: 'bg-status-member' },
    {
      label: 'Pending',
      value:
        readiness.total -
        readiness.coordinatorVerified -
        readiness.headVerified -
        readiness.memberComplete,
      color: 'bg-surface-container',
    },
  ]

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {entries.map((e) => (
        <li key={e.label} className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${e.color}`} aria-hidden="true" />
          {e.label}
          <span className="font-mono text-label-sm text-on-surface">{e.value}</span>
        </li>
      ))}
    </ul>
  )
}
