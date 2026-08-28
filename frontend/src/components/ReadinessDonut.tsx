import type { Readiness } from '../lib/readiness'

interface ReadinessDonutProps {
  readiness: Readiness
  /** Outer diameter in px. */
  size?: number
  label?: string
  /**
   * `hero` is the one big ring a screen is allowed: rounded caps, the
   * figure set in the display face rather than mono, and a word under it
   * saying what the number is. Everywhere else stays `plain`, so the hero
   * keeps being the thing the eye lands on first.
   */
  variant?: 'plain' | 'hero'
  /** The word under the figure, on the hero ring. */
  caption?: string
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
export function ReadinessDonut({
  readiness,
  size = 128,
  label,
  variant = 'plain',
  caption = 'Ready',
}: ReadinessDonutProps) {
  const hero = variant === 'hero'
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
              strokeLinecap={hero ? 'round' : 'butt'}
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.start}
            />
          ))}
        </g>
        <text
          x="50%"
          y={hero ? '46%' : '50%'}
          textAnchor="middle"
          dominantBaseline="central"
          className={hero ? 'fill-on-surface' : 'fill-on-surface font-mono'}
          style={{
            fontSize: size * (hero ? 0.28 : 0.26),
            fontWeight: 600,
            letterSpacing: hero ? '-0.03em' : undefined,
          }}
        >
          {readiness.pct === null ? '—' : `${readiness.pct}%`}
        </text>
        {hero && (
          <text
            x="50%"
            y="65%"
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-on-surface-faint font-mono"
            style={{ fontSize: Math.max(10, size * 0.068), letterSpacing: '0.16em' }}
          >
            {caption.toUpperCase()}
          </text>
        )}
      </svg>
      {label && !hero && (
        <figcaption className="max-w-32 text-center text-body-sm text-on-surface">{label}</figcaption>
      )}
    </figure>
  )
}

/**
 * The key for a group of rings.
 *
 * A ring is segmented by stage, not by one flat percentage, which is the
 * whole point of it — two teams both at 67% can be at 67% in different
 * ways, one with an item signed off and another only checked. Without a key
 * that reads as arbitrary colour, so any tile showing more than one ring
 * shows this too.
 */
export function ReadinessLegend({ className = '' }: { className?: string }) {
  const entries = [
    { label: 'Signed off', color: 'bg-status-coordinator' },
    { label: 'Head verified', color: 'bg-status-head' },
    { label: 'Checked', color: 'bg-status-member' },
    { label: 'Not started', color: 'bg-status-pending' },
  ]

  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5 text-label-md text-on-surface-variant">
          <span className={`h-2 w-2 shrink-0 rounded-full ${entry.color}`} aria-hidden="true" />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}
