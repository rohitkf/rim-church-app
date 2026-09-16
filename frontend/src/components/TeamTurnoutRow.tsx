import { Link } from 'react-router-dom'
import type { TurnoutRing } from '../lib/teamTurnout'

/**
 * A team's two figures as one ring.
 *
 * The faint arc is what the team said it would do; the solid one is what
 * it did. Turnout can never exceed the promise — only people who said yes
 * are marked in — so the solid arc always sits inside the faint one, and
 * the gap between them is the shortfall, read without doing any sums.
 */
function TeamRing({
  predictedPct,
  actualPct,
  color,
}: {
  predictedPct: number
  /** Null while nobody has been marked: there is no second arc to draw. */
  actualPct: number | null
  color: string
}) {
  const size = 44
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const arc = (pct: number) => (Math.min(Math.max(pct, 0), 100) / 100) * circumference

  // A round cap draws a dot even at zero length, so an empty arc has to be
  // left out rather than drawn empty — otherwise a team with nobody
  // available wears a full stop at twelve o'clock.
  //
  // A function returning an element rather than a component: one declared
  // in here would be a new component type on every render, and React would
  // throw its state away each time.
  const arcFor = (pct: number, opacity: number) =>
    pct > 0 ? (
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${arc(pct)} ${circumference - arc(pct)}`}
      />
    ) : null

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-raised-strong" />
        {/* Expected. Faded only when there is a solid arc in front of it to
            be compared against — on its own it is the figure, and a ghost
            of an already-grey token is no ring at all. */}
        {arcFor(predictedPct, actualPct === null ? 1 : 0.3)}
        {arcFor(actualPct ?? 0, 1)}
      </g>
    </svg>
  )
}

/** One figure of the pair: a label, the number, and the people behind it. */
function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <span className="min-w-0">
      <span className="block font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
        {label}
      </span>
      <span className="block text-body-md font-medium" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
      <span className="block break-words font-mono text-label-sm text-on-surface-faint">{sub}</span>
    </span>
  )
}

/**
 * One team's line in Teams on duty.
 *
 * Expected and turned up sit side by side all week rather than one
 * replacing the other, because the pair is more use than either: the
 * first says how much of the team is coming, the second how much of it
 * came, and both are shares of the same roster so the drop can be read
 * straight off.
 */
export function TeamTurnoutRow({ name, ring }: { name: string; ring: TurnoutRing }) {
  const settled = ring.state === 'settled'
  return (
    <Link
      to="/availability"
      className="flex items-start gap-3.5 rounded-[var(--radius-row)] bg-raised px-4 py-3.5 hairline transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-raised-strong"
    >
      <TeamRing predictedPct={ring.predictedPct} actualPct={ring.actualPct} color={ring.color} />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-body-sm font-medium text-on-surface">{name}</span>
        <span className="mt-1.5 grid grid-cols-2 gap-x-3">
          <Figure
            label="Expected"
            value={`${ring.predictedPct}%`}
            sub={ring.expectedSub}
            tone={ring.state === 'none-available' ? ring.color : undefined}
          />
          {/* Coloured only once it is final: a figure still climbing wears
              the same grey as the prediction it has not caught up with. */}
          <Figure
            label="Turned up"
            value={ring.actualValue}
            sub={ring.actualSub}
            tone={settled ? ring.color : undefined}
          />
        </span>
        {ring.toAnswer > 0 && (
          <span className="mt-1.5 block font-mono text-label-sm text-on-surface-faint">
            {ring.toAnswer} still to answer
          </span>
        )}
      </span>
    </Link>
  )
}
