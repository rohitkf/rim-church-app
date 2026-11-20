import { useNow } from '../lib/useNow'
import { formatTime } from '../lib/time'
import { clockFace, type ClockTone } from '../lib/serviceClock'
import { peopleLine, sessionGlimpse, type GlimpseSession } from '../lib/sessionGlimpse'

/*
 * A glance at a running service, on its Dashboard card: what is on, who is
 * taking it, how long it has left — or how far over it is — and what comes
 * next. The Service Planner's clock (lib/serviceClock), small: open the
 * running order or the Countdown for the whole of it.
 *
 * It keeps its own second hand, so the Dashboard around it is not redrawn
 * every second for the sake of one number.
 */

/** The number's colour for each state of the clock: the app's green, amber and red, as on Countdown. */
const TONE_CLASS: Record<ClockTone, string> = {
  plenty: 'text-accent-green-soft',
  close: 'text-accent-orange-soft',
  out: 'text-error',
}

export function SessionGlimpse({
  sessions,
  endedAt,
  endHeld = false,
  variant = 'card',
  className = '',
}: {
  /** The service's running order, in the order it is drawn. */
  sessions: GlimpseSession[]
  endedAt?: string | null
  /** "Not ended" is on (services.end_held_at, 0292). */
  endHeld?: boolean
  /** `card`: the block inside an open service. `line`: a few words for the service's own row. */
  variant?: 'card' | 'line'
  className?: string
}) {
  const now = useNow(1000)
  const glimpse = sessionGlimpse(sessions, now, endedAt, endHeld)
  if (!glimpse) return null

  const face = clockFace(glimpse.remainingMs)
  const time = glimpse.over ? `${face} over` : `${face} left`
  const spoken = glimpse.over ? `${face.slice(1)} over` : `${face} left`
  const what = glimpse.current?.name ?? 'Between sessions'

  if (variant === 'line') {
    return (
      // The row is shut, so this is all there is: the session, who is on
      // it, and its clock. Nobody on it is said in the open card, not here.
      <span className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
        <span className="text-on-surface">{what}</span>
        {glimpse.current && glimpse.current.people.length > 0 && (
          <span className="text-on-surface-variant">{peopleLine(glimpse.current.people)}</span>
        )}
        <span className={`tabular ${TONE_CLASS[glimpse.tone]}`} aria-label={spoken}>
          {time}
        </span>
      </span>
    )
  }

  return (
    <div
      role="group"
      aria-label="On now"
      className={`rounded-[var(--radius-card)] bg-surface-lowest px-4 py-3.5 hairline ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className="block font-mono text-label-sm text-on-surface-faint">
            {glimpse.current ? 'Now' : 'Between sessions'}
          </span>
          {glimpse.current && <span className="block text-headline-sm text-on-surface">{glimpse.current.name}</span>}
        </span>
        <span
          role="timer"
          aria-live="off"
          aria-label={spoken}
          data-tone={glimpse.tone}
          className={`font-mono text-headline-md font-semibold tabular ${TONE_CLASS[glimpse.tone]}`}
        >
          {face}
          <span className="ml-1.5 text-label-md font-medium">{glimpse.over ? 'over' : 'left'}</span>
        </span>
      </div>
      {glimpse.current && <p className="mt-1 text-body-sm text-on-surface-variant">{peopleLine(glimpse.current.people)}</p>}
      <p className="mt-2 text-label-md text-on-surface-faint">
        {glimpse.next ? (
          <>
            {glimpse.over && glimpse.holding ? 'Waiting to start' : 'Next'}:{' '}
            <span className="text-on-surface-variant">{glimpse.next.name}</span>
            <span className="font-mono"> · {formatTime(new Date(glimpse.next.at).toISOString())}</span>
          </>
        ) : glimpse.over ? (
          glimpse.holding ? 'Not ended yet — past the planned end.' : 'Past the planned end.'
        ) : (
          'Then the end of the service.'
        )}
      </p>
    </div>
  )
}
