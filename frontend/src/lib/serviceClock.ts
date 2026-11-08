/**
 * The service's clock: what the countdown on the running order is counting
 * to, right now.
 *
 * The Service Planner draws it on the rail beside the session that is on —
 * the time until the next session is due, or until the service is due to
 * end — and the Countdown page (/countdown) draws the same number large,
 * for whoever is watching the time from the side of the stage. Both read
 * it from here, so they cannot disagree: time added to a session moves the
 * start of everything after it (lib/sessionRunPlan), "Not started yet" on
 * the next session holds the one before it on, and a session that started
 * early ends the one before it — each changes this answer, on both pages,
 * the moment the running order changes.
 */
import { heldBackBy } from './sessionRunPlan'
import { serviceBounds, serviceProgress } from './serviceProgress'

export interface ClockSession {
  id: string
  session_name: string
  start_time: string
  duration_minutes: number | null
  added_minutes?: number | null
  skipped_at?: string | null
  held_at?: string | null
}

export interface ServiceClock<S extends ClockSession = ClockSession> {
  /** The session on now — running, or held on by the next one not starting. Null in a gap. */
  current: S | null
  /** What the clock counts to: the next session, or the service's end. */
  next: S | null
  to: 'session' | 'end'
  /** When that is, epoch ms. */
  target: number
  /**
   * The next session has been marked not started, so the current one is
   * still going past its time: the overrun is real, not a clock being slow.
   */
  holding: boolean
}

/**
 * The countdown for a running order, in the order it is drawn.
 *
 * Exactly the planner's rule: against the first session that is on (the
 * clock's, or held on by the next one), count to the next session that is
 * not skipped; against the last one, to the planned end — unless somebody
 * has called the end. Null when nothing is on: before the first session, or
 * once the service is over.
 *
 * `gaps` widens it for the Countdown page, which also counts across a
 * planned gap between two sessions (to the next one) and past the planned
 * end of the last (as overrun) until End service is pressed. The rail draws
 * neither, because the rail has a dot for each and says so itself.
 */
export function serviceClock<S extends ClockSession>(
  sessions: S[],
  now: number,
  endedAt: string | null | undefined,
  { gaps = false }: { gaps?: boolean } = {},
): ServiceClock<S> | null {
  if (endedAt && now >= new Date(endedAt).getTime()) return null
  const progress = serviceProgress(sessions, now)
  const bounds = serviceBounds(sessions)
  const lastLive = [...sessions].reverse().find((s) => !s.skipped_at) ?? null

  for (let i = 0; i < sessions.length; i += 1) {
    const session = sessions[i]
    const heldBack = heldBackBy(sessions, i)
    if (progress.runningId !== session.id && !heldBack) continue
    const next = sessions.slice(i + 1).find((s) => !s.skipped_at) ?? null
    if (next) {
      return { current: session, next, to: 'session', target: new Date(next.start_time).getTime(), holding: !!heldBack }
    }
    if (session.id === lastLive?.id && bounds) {
      return { current: session, next: null, to: 'end', target: bounds.to, holding: false }
    }
  }

  if (!gaps || !bounds || now < bounds.from) return null
  // Between two sessions: count to the next one that has not begun.
  const ahead = sessions.find((s) => !s.skipped_at && new Date(s.start_time).getTime() > now)
  if (ahead) return { current: null, next: ahead, to: 'session', target: new Date(ahead.start_time).getTime(), holding: false }
  // Past the last session's end with nobody having called it: overrunning.
  if (lastLive) return { current: lastLive, next: null, to: 'end', target: bounds.to, holding: false }
  return null
}

/**
 * A clock reading, as a stage monitor shows it: 4:05, 1:02:09, and past
 * zero the overrun with a plus — +2:17. Seconds always, because the last
 * minute is the one being watched.
 */
export function clockFace(ms: number): string {
  const over = ms < 0
  const total = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  return over ? `+${body}` : body
}
