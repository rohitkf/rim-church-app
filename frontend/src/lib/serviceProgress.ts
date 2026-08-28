/**
 * How far through a running order the clock has got.
 *
 * The planner draws a service as a vertical rail with a dot per session.
 * That rail is also a timeline, so it can say where "now" is: the part of
 * it that has already happened fills in, the session on at this moment is
 * partly filled, and everything ahead stays quiet. Someone glancing at a
 * screen backstage then knows what is on without reading a single time.
 *
 * Every session's share is computed on its own segment of the rail rather
 * than from a measured height, so a phone and a monitor draw the same thing
 * and nothing has to be re-measured on resize.
 */

export type SessionState = 'done' | 'running' | 'ahead'

export interface SessionTiming {
  id: string
  start_time: string
  duration_minutes: number | null
}

export interface SessionProgress {
  state: SessionState
  /** How much of this session's rail segment is filled, 0 to 1. */
  fill: number
}

export interface ServiceProgress {
  /** The session on right now, if any. */
  runningId: string | null
  byId: Map<string, SessionProgress>
  started: boolean
  finished: boolean
}

const EMPTY: ServiceProgress = {
  runningId: null,
  byId: new Map(),
  started: false,
  finished: false,
}

export function serviceProgress(
  sessions: SessionTiming[],
  now: number = Date.now(),
): ServiceProgress {
  const timed = sessions
    .map((s) => ({ ...s, start: new Date(s.start_time).getTime() }))
    .filter((s) => !Number.isNaN(s.start))
  if (timed.length === 0) return EMPTY

  const byId = new Map<string, SessionProgress>()
  let runningId: string | null = null

  for (const session of timed) {
    const length = Math.max(session.duration_minutes ?? 0, 0) * 60_000
    const end = session.start + length

    if (now >= end) {
      // A zero-length session is done the moment its start passes: there is
      // no window to be inside.
      byId.set(session.id, { state: 'done', fill: 1 })
    } else if (now >= session.start) {
      const fill = length === 0 ? 1 : (now - session.start) / length
      byId.set(session.id, { state: 'running', fill })
      runningId = session.id
    } else {
      byId.set(session.id, { state: 'ahead', fill: 0 })
    }
  }

  const first = Math.min(...timed.map((s) => s.start))
  const last = Math.max(...timed.map((s) => s.start + Math.max(s.duration_minutes ?? 0, 0) * 60_000))

  return { runningId, byId, started: now >= first, finished: now >= last }
}

/**
 * A service's window: when the first session starts and the last one ends.
 *
 * `null` when nobody has planned a running order — a service with no
 * sessions has no times, and inventing some would be worse than saying so.
 */
export function serviceBounds(sessions: SessionTiming[]): { from: number; to: number } | null {
  const timed = sessions
    .map((s) => ({ start: new Date(s.start_time).getTime(), length: Math.max(s.duration_minutes ?? 0, 0) }))
    .filter((s) => !Number.isNaN(s.start))
  if (timed.length === 0) return null
  return {
    from: Math.min(...timed.map((s) => s.start)),
    to: Math.max(...timed.map((s) => s.start + s.length * 60_000)),
  }
}

/** The first session still ahead of the clock. */
export function nextToStart(sessions: SessionTiming[], now: number = Date.now()): string | null {
  const ahead = sessions
    .map((s) => ({ id: s.id, start: new Date(s.start_time).getTime() }))
    .filter((s) => !Number.isNaN(s.start) && s.start > now)
    .sort((a, b) => a.start - b.start)
  return ahead[0]?.id ?? null
}

/**
 * How far each session ran past the time it was given, in minutes.
 *
 * Nothing extra is stored to know this. A running order cascades — each
 * session starts when the one before it was due to finish — so the two only
 * disagree once someone says "this is starting now", and the size of the
 * disagreement *is* the overrun. A session with nothing after it has no
 * measurable overrun: nothing has happened yet to prove it ended.
 */
/**
 * The session the "Session started" button belongs on.
 *
 * The one the clock says is on right now — because that is the session a
 * late service is still waiting to begin. When Worship overruns, the plan
 * has already moved on to Intercessory; pressing the button on Intercessory
 * when it really starts is what records Worship's overrun and pushes
 * everything after it along.
 *
 * Before the service, nothing is running, so it falls to the first session:
 * a service that starts twenty minutes late says so the same way.
 *
 * Putting it on the *next* session instead would be useless, because the
 * next session's start is by definition still in the future — setting it to
 * now could only ever move it earlier, and an overrun would never be
 * recordable at all.
 */
export function startableSession(
  sessions: SessionTiming[],
  now: number = Date.now(),
): string | null {
  return serviceProgress(sessions, now).runningId ?? nextToStart(sessions, now)
}

export function overrunMinutes(sessions: SessionTiming[]): Map<string, number> {
  const ordered = sessions
    .map((s) => ({
      id: s.id,
      start: new Date(s.start_time).getTime(),
      length: Math.max(s.duration_minutes ?? 0, 0) * 60_000,
    }))
    .filter((s) => !Number.isNaN(s.start))
    .sort((a, b) => a.start - b.start)

  const over = new Map<string, number>()
  for (let i = 0; i < ordered.length - 1; i += 1) {
    const dueToEnd = ordered[i].start + ordered[i].length
    const actuallyEnded = ordered[i + 1].start
    const minutes = Math.round((actuallyEnded - dueToEnd) / 60_000)
    if (minutes > 0) over.set(ordered[i].id, minutes)
  }
  return over
}
