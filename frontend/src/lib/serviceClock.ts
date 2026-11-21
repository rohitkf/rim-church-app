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
 *
 * The last session has nothing after it to hold it on, so the service has
 * a hold of its own: "Not ended" (services.end_held_at, 0292). With it the
 * closing session stays on past its time and the clock counts its overrun,
 * here and on the rail, until End service is pressed.
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
   * The next session has been marked not started — or, for the last one,
   * the service marked not ended — so the current one is still going past
   * its time: the overrun is real, not a clock being slow.
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
 *
 * `endHeld` is "Not ended": the rail then counts past the planned end too,
 * against the last session, for as long as nobody has called the end.
 */
export function serviceClock<S extends ClockSession>(
  sessions: S[],
  now: number,
  endedAt: string | null | undefined,
  { gaps = false, endHeld = false }: { gaps?: boolean; endHeld?: boolean } = {},
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
      return { current: session, next: null, to: 'end', target: bounds.to, holding: endHeld }
    }
  }

  // Not ended: the closing session is still on, however far past its time.
  if (endHeld && bounds && lastLive && now >= bounds.to) {
    return { current: lastLive, next: null, to: 'end', target: bounds.to, holding: true }
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
 * How pressing the time is, for the colour of the big clock: plenty left
 * (green), getting close (amber), nearly out or over (red).
 *
 * A share of the session rather than a fixed number of minutes, because a
 * two-minute notice and a forty-minute message do not get close at the
 * same moment — but capped, so a long session does not sit amber for ten
 * minutes: amber for the last quarter or five minutes, whichever is
 * shorter; red for the last tenth or the last minute, and past zero.
 *
 * `spanMs` is how long the thing being counted runs in all. Without one (a
 * gap between two sessions) the caps alone decide.
 */
export type ClockTone = 'plenty' | 'close' | 'out'

export function clockTone(remainingMs: number, spanMs?: number | null): ClockTone {
  if (remainingMs <= 0) return 'out'
  const span = spanMs && spanMs > 0 ? spanMs : Infinity
  if (remainingMs <= Math.min(60_000, span * 0.1)) return 'out'
  if (remainingMs <= Math.min(5 * 60_000, span * 0.25)) return 'close'
  return 'plenty'
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

/**
 * The same reading as the Countdown page alone shows it: past zero with a
 * minus, −2:17. Time left that has gone below nothing.
 *
 * Everywhere else an overrun keeps its plus (the Service Planner's rail,
 * the Dashboard's glimpse, the minutes added to a session): there it is
 * read beside a plan, as minutes on top of it. The Countdown is read from
 * the stage as one number counting down, and a number that has counted
 * down past zero is a negative one. The Owner, November 2026: "instead of
 * showing +, show -. This is only for countdown page."
 *
 * It is the minus sign itself (U+2212) and not a hyphen: the same width
 * as the plus it replaces, so the number does not jump as it crosses zero
 * and `clockSize` fits it exactly as before.
 */
export function countdownFace(ms: number): string {
  const face = clockFace(ms)
  return face.startsWith('+') ? `−${face.slice(1)}` : face
}

/**
 * How big the number is: as big as it has always been, and never wider
 * than its card.
 *
 * It was sized from the screen alone (22vw), which holds for 4:05 and
 * 12:55 and not for 1:12:55: with an hour on it the number is two
 * characters longer, and on a phone it ran out of the card's right-hand
 * edge. So the card is the container, and the size is also held to what
 * that many characters fit in: about 0.62em each, as `FitFigure` counts
 * them (components/Surface). A face shorter than five is sized as five,
 * so 9:59 turning to 10:00 does not change size; the number steps down
 * only when an hour comes onto it.
 */
export function clockSize(face: string, widest: string): string {
  return `min(${widest}, ${Math.floor(1600 / Math.max(face.length, 5)) / 10}cqi)`
}

/**
 * The same reading as one number of minutes: 1:12:55 is 73 minutes.
 *
 * A clock face with an hour on it has to be worked out before it can be
 * said aloud ("an hour twelve, so seventy-two, three"), and whoever is
 * signalling a preacher from the back wants the number that goes on the
 * card. So the minutes are said under the clock, wherever it is drawn.
 *
 * Counting down it rounds up, the way a timer does: 72:55 left is "73
 * minutes", and it says 73 until 72:00 is reached, so the number is never
 * more time than there is by a whole minute and never claims a minute
 * that has not been reached. Counting up past zero it rounds down: +2:17
 * is "2 minutes over". Inside the last minute either way there is no
 * honest whole number, so it says "under a minute".
 */
export function clockMinutes(ms: number): { minutes: number; over: boolean } {
  const over = ms < 0
  return { minutes: over ? Math.floor(-ms / 60_000) : Math.ceil(ms / 60_000), over }
}

/** In words, under the big clock: "73 minutes remaining", "2 minutes over". */
export function minutesWords(ms: number): string {
  const { minutes, over } = clockMinutes(ms)
  const end = over ? 'over' : 'remaining'
  if ((over && minutes < 1) || (!over && ms < 60_000)) return `Under a minute ${end}`
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${end}`
}

/** In a few characters, under the rail's pill: "73 min", "<1 min", "2 min over". */
export function minutesShort(ms: number): string {
  const { minutes, over } = clockMinutes(ms)
  const count = (over && minutes < 1) || (!over && ms < 60_000) ? '<1' : String(minutes)
  return over ? `${count} min over` : `${count} min`
}
