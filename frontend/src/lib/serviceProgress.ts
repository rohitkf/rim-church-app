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

export type SessionState = 'done' | 'running' | 'ahead' | 'skipped'

export interface SessionTiming {
  id: string
  start_time: string
  duration_minutes: number | null
  /** Set when the session was dropped: it takes no time and never runs. */
  skipped_at?: string | null
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
    if (session.skipped_at) {
      // A dropped session is neither ahead nor done — it did not happen, and
      // the rail should not fill for it.
      byId.set(session.id, { state: 'skipped', fill: 0 })
      continue
    }
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

  const ran = timed.filter((s) => !s.skipped_at)
  if (ran.length === 0) return { runningId, byId, started: false, finished: false }
  const first = Math.min(...ran.map((s) => s.start))
  const last = Math.max(...ran.map((s) => s.start + Math.max(s.duration_minutes ?? 0, 0) * 60_000))

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
    // A skipped session took no time and did not happen, so it neither opens
    // nor closes the window the service actually ran in.
    .filter((s) => !s.skipped_at)
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
    .filter((s) => !s.skipped_at)
    .map((s) => ({ id: s.id, start: new Date(s.start_time).getTime() }))
    .filter((s) => !Number.isNaN(s.start) && s.start > now)
    .sort((a, b) => a.start - b.start)
  return ahead[0]?.id ?? null
}

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

/**
 * How far each session's actual end fell from the time it was given, in
 * minutes — positive for over, negative for under.
 *
 * Nothing extra is stored to know this. A running order cascades, so a
 * session's planned end and the next one's start are the same instant until
 * somebody says "this is starting now"; after that, the disagreement *is*
 * the variance. Under-runs matter as much as over-runs: a service that keeps
 * finishing five minutes early is a plan that needs correcting, and it is
 * invisible if only the late ones are counted.
 *
 * A skipped session took no time, so it is not the thing the session before
 * it ran into — the comparison jumps over it to whatever actually followed.
 *
 * The last session has nothing after it, so normally nothing proves it
 * ended and it gets no variance. `endedAt` is that proof: once somebody has
 * called the end of the service, the closing session can be measured like
 * every other one.
 */
export function runVariance(
  sessions: SessionTiming[],
  endedAt?: string | null,
): Map<string, number> {
  const ordered = sessions
    .map((s) => ({
      id: s.id,
      skipped: !!s.skipped_at,
      start: new Date(s.start_time).getTime(),
      length: Math.max(s.duration_minutes ?? 0, 0) * 60_000,
    }))
    .filter((s) => !Number.isNaN(s.start))
    .sort((a, b) => a.start - b.start)

  const ran = ordered.filter((s) => !s.skipped)
  const called = endedAt ? new Date(endedAt).getTime() : NaN
  const variance = new Map<string, number>()
  for (let i = 0; i < ran.length; i += 1) {
    const dueToEnd = ran[i].start + ran[i].length
    // What actually followed: the next session's start, or — for the last
    // one — the moment the service was called ended.
    const actuallyEnded = i < ran.length - 1 ? ran[i + 1].start : called
    if (Number.isNaN(actuallyEnded)) continue
    const minutes = Math.round((actuallyEnded - dueToEnd) / 60_000)
    if (minutes !== 0) variance.set(ran[i].id, minutes)
  }
  return variance
}
