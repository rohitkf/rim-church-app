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
