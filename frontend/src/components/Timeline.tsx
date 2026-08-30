import { useEffect, useState, type ReactNode } from 'react'
import { formatCountdown } from '../lib/countdown'

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
  skipped = false,
  countdown,
  added,
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
  /**
   * Minutes between when this one was due to end and when the next thing
   * actually began — positive over, negative early.
   */
  over?: number
  /** This session was dropped: it did not happen and took no time. */
  skipped?: boolean
  /** Time until the next session, shown in the gap this row's rail leaves. */
  countdown?: ReactNode
  /** Minutes granted on request, so the plan's own length stays readable. */
  added?: number
  children: ReactNode
}) {
  const filled = Math.min(Math.max(fill ?? 0, 0), 1)
  const dot = skipped
    ? // Hollow: the one dot on the rail that marks a thing that did not
      // happen, so a glance down the service reads the gaps as gaps.
      'bg-transparent ring-1 ring-on-surface-faint'
    : running
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
        <div
          className={`font-mono text-label-md tabular ${
            skipped ? 'text-on-surface-faint line-through' : 'text-on-surface-variant'
          }`}
        >
          {time}
        </div>
        {meta && <div className="mt-1 font-mono text-label-sm text-on-surface-faint">{meta}</div>}
        {/* Time somebody asked for, kept visibly apart from time that was
            planned — otherwise next month's plan gets built from a length
            this session was only ever granted. */}
        {added !== undefined && added > 0 && (
          <div className="mt-1 font-mono text-label-sm text-accent-blue tabular">+{added} asked</div>
        )}
        {/* How the session actually ran, under the time it was given. Late
            is the colour the app keeps for off-plan; early is quiet, because
            finishing early is information rather than a problem. */}
        {over !== undefined && over !== 0 && (
          <div
            className={`mt-1 font-mono text-label-sm tabular ${
              over > 0 ? 'text-error' : 'text-accent-green'
            }`}
          >
            {over > 0 ? `+${over} over` : `${Math.abs(over)} early`}
          </div>
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

        {/*
          Centred on the line, halfway down the run of rail between this dot
          and the next one — which is the gap it is counting.

          The rail column is 12px wide, so the pill has to be allowed out of
          it, and it is opaque so the line reads as passing behind rather
          than through. `top` is the row's midpoint plus the 29px that puts
          the dot where it is, which is the midpoint of the segment rather
          than of the row.
        */}
        {countdown && (
          <span className="absolute left-1/2 top-[calc(50%+29px)] z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
            {countdown}
          </span>
        )}
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
  tone?: 'plain' | 'warning' | 'running' | 'skipped'
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
    // Dropped: still legible, plainly not part of the service any more.
    skipped: 'bg-transparent hairline opacity-60',
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
      <span className="break-words text-label-md text-on-surface">{name}</span>
    </span>
  )
}

/**
 * How long until the next session, ticking.
 *
 * On the rail rather than in the card, because it is a fact about the gap
 * between two sessions rather than about either of them. It only appears
 * against the session on right now: a countdown to every future session at
 * once is a wall of numbers, and only one of them is the next thing to
 * happen.
 */
export function RailCountdown({
  startsAt,
  holding = false,
}: {
  startsAt: string
  /**
   * The next session has been marked not started, so this one is still
   * running. Past its planned end the clock counts up rather than sitting
   * at "due": the number somebody wants then is how far over it is.
   */
  holding?: boolean
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = new Date(startsAt).getTime() - now
  const over = remaining <= 0
  const text = over && holding ? `+${formatCountdown(-remaining)}` : formatCountdown(remaining)

  const tone = !over
    ? 'text-accent-green ring-accent-green/40'
    : holding
      ? 'text-error ring-error/45'
      : 'text-accent-orange-soft ring-accent-orange/45'

  const label = !over
    ? `Next session in ${text}`
    : holding
      ? `Running ${formatCountdown(-remaining)} over`
      : 'The next session is due to start'

  return (
    <span
      className={`inline-block rounded-full bg-surface-lowest px-2 py-0.5 font-mono text-[11px] leading-[1.45] tabular ring-1 ${tone}`}
      aria-label={label}
    >
      {text}
    </span>
  )
}
