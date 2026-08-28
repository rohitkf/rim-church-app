import type { ReactNode } from 'react'

export type TimelineTone = 'plain' | 'now' | 'warning'

/**
 * A running order as a vertical clock.
 *
 * A table makes you read a time column and a name column and join them
 * yourself. A timeline does the joining: the times are locked to a rail on
 * the left, the sessions hang off it in order, and the gap between two
 * dots is the shape of the service. What you actually want to know —
 * what's next, what has nobody on it — is then a glance rather than a
 * scan.
 *
 * The rail collapses on a phone, where 96px of times beside a card would
 * leave the card too narrow to hold a name.
 */
export function TimelineRow({
  time,
  meta,
  tone = 'plain',
  last = false,
  fill,
  running = false,
  over,
  children,
}: {
  time: ReactNode
  /** Duration, or whatever sits under the time. */
  meta?: ReactNode
  tone?: TimelineTone
  /** The last row stops the line rather than trailing it into nothing. */
  last?: boolean
  /**
   * How much of this row's rail has already happened, 0 to 1.
   *
   * The rail is also a clock: giving each row its own share means the fill
   * is exact at any width without measuring a single element, and a service
   * runs down the page as it runs in the room.
   */
  fill?: number
  /** This is the session on right now. */
  running?: boolean
  /** Minutes this one ran past the time it was given. */
  over?: number
  children: ReactNode
}) {
  const filled = Math.min(Math.max(fill ?? 0, 0), 1)
  const dot = running
    ? 'bg-accent-green pulse-live'
    : filled >= 1
      ? 'bg-accent-green'
      : {
          plain: 'bg-on-surface-faint',
          now: 'bg-primary',
          warning: 'bg-accent-orange',
        }[tone]

  const rail = { bottom: last ? 'calc(100% - 2rem)' : '-0.375rem' }

  return (
    <li className="flex gap-3 sm:gap-5">
      <div className="w-14 shrink-0 pt-5 text-right sm:w-24">
        <div className="font-mono text-label-md text-on-surface-variant tabular">{time}</div>
        {meta && <div className="mt-1 font-mono text-label-sm text-on-surface-faint">{meta}</div>}
        {/* The overrun sits under the time it broke, in the one colour the
            app keeps for a thing that did not go to plan. */}
        {over !== undefined && over > 0 && (
          <div className="mt-1 font-mono text-label-sm text-error tabular">+{over} over</div>
        )}
      </div>

      <div aria-hidden="true" className="relative flex w-3 shrink-0 justify-center">
        <span data-rail="line" className="absolute -top-1.5 w-0.5 bg-outline-variant" style={rail} />
        {filled > 0 && (
          // The same geometry as the rail, clipped from the bottom — so the
          // green is exactly the line, not a second line beside it.
          <span
            data-rail="elapsed"
            className="absolute -top-1.5 w-0.5 bg-accent-green transition-[clip-path] duration-700 ease-[var(--ease-glide)]"
            style={{ ...rail, clipPath: `inset(0 0 ${(1 - filled) * 100}% 0)` }}
          />
        )}
        <span data-rail="dot" className={`absolute top-6 h-2.5 w-2.5 rounded-full ${dot}`} />
      </div>

      <div className="min-w-0 flex-1 pb-2.5">{children}</div>
    </li>
  )
}

/**
 * The card that hangs off the rail. `warning` is for a session with nobody
 * on it — the one state a running order has to make impossible to miss.
 */
export function TimelineCard({
  tone = 'plain',
  children,
  className = '',
}: {
  tone?: 'plain' | 'warning' | 'running'
  children: ReactNode
  className?: string
}) {
  const tones = {
    plain: 'bg-raised hairline',
    warning:
      'bg-[color-mix(in_oklab,var(--color-accent-orange)_7%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_24%,transparent)]',
    // The session on right now, so a glance from the back of the room lands
    // on it before it lands on anything else.
    running:
      'bg-[color-mix(in_oklab,var(--color-accent-green)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-green)_32%,transparent)]',
  }
  return (
    <div
      className={`rounded-[var(--radius-panel)] px-4 py-4 sm:px-5 ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  )
}

/** The person a session belongs to, as a pill with their initials. */
export function AssigneePill({
  name,
  initials,
  tone = 'neutral',
}: {
  name: ReactNode
  initials: string
  tone?: 'neutral' | 'blue' | 'green' | 'indigo'
}) {
  const tones = {
    neutral: 'bg-raised-strong text-on-surface-variant',
    blue: 'bg-[color-mix(in_oklab,var(--color-accent-blue)_24%,transparent)] text-accent-blue-soft',
    green: 'bg-[color-mix(in_oklab,var(--color-accent-green)_22%,transparent)] text-accent-green',
    indigo: 'bg-[color-mix(in_oklab,var(--color-accent-indigo)_26%,transparent)] text-accent-indigo-soft',
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-raised-strong py-1.5 pl-1.5 pr-3.5">
      <span
        aria-hidden="true"
        className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[11px] ${tones[tone]}`}
      >
        {initials}
      </span>
      <span className="truncate text-label-md text-on-surface">{name}</span>
    </span>
  )
}
