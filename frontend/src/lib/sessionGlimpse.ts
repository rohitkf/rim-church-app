/**
 * A glance at a running service, for the Dashboard: what is on, who is
 * taking it, how long it has left (or how far over it is), and what comes
 * next.
 *
 * It is the service's clock (lib/serviceClock) with the names read off the
 * session it points at, so the Dashboard, the Service Planner's rail and
 * the Countdown page say the same thing: time added, a session not started
 * yet, one dropped, a service marked not ended — each reaches all three.
 */
import { clockTone, serviceClock, type ClockSession, type ClockTone } from './serviceClock'
import { namesOn } from './sessionAssignees'
import type { SessionAssignee } from './types'

export interface GlimpseSession extends ClockSession {
  assignees?: SessionAssignee[]
}

export interface SessionGlimpse {
  /** The session on now; null in a planned gap between two. */
  current: { name: string; people: string[] } | null
  /** What follows, and when it is due; null when the service's end is what follows. */
  next: { name: string; at: number } | null
  /** Milliseconds to the moment being counted to; negative once it has passed. */
  remainingMs: number
  /** Past that moment: the number is an overrun. */
  over: boolean
  /** The overrun is somebody's word (not started, not ended) rather than the clock alone. */
  holding: boolean
  /** Counting to the next session, or to the end of the service. */
  to: 'session' | 'end'
  tone: ClockTone
}

/**
 * The glimpse for one service's running order, in the order it is drawn.
 * Null when nothing is on: before the first session, with no running
 * order, or once the end has been called.
 */
export function sessionGlimpse(
  sessions: GlimpseSession[],
  now: number,
  endedAt: string | null | undefined,
  endHeld = false,
): SessionGlimpse | null {
  const clock = serviceClock(sessions, now, endedAt, { gaps: true, endHeld })
  if (!clock) return null
  const remainingMs = clock.target - now
  const span = clock.current ? clock.target - new Date(clock.current.start_time).getTime() : null
  return {
    current: clock.current ? { name: clock.current.session_name, people: namesOn(clock.current) } : null,
    next: clock.next ? { name: clock.next.session_name, at: new Date(clock.next.start_time).getTime() } : null,
    remainingMs,
    over: remainingMs < 0,
    holding: clock.holding,
    to: clock.to,
    tone: clockTone(remainingMs, span),
  }
}

/** "Rohit K., Anna M. and 2 more" — as many names as a line has room for. */
export function peopleLine(people: string[], most = 2): string {
  if (people.length === 0) return 'Nobody on it yet'
  if (people.length <= most) return people.join(', ')
  const rest = people.length - most
  return `${people.slice(0, most).join(', ')} and ${rest} more`
}
