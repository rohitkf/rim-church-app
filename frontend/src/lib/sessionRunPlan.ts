import { addMinutesIso } from './time'

/**
 * Working a running order while the service is actually on.
 *
 * Two things happen in a live service that a plan cannot predict: a session
 * starts later (or earlier) than it was meant to, and a session gets
 * dropped. Both change every time after them, because a running order
 * cascades — each session starts when the one before it was due to end.
 *
 * The arithmetic for that lives here, as plain functions over plain rows,
 * returning the writes to make rather than making them. That is what lets
 * the confirmation dialog show exactly what is about to happen: it is
 * reading the same plan the mutation will apply, not a description of it
 * written separately and free to drift.
 */

export interface RunSession {
  id: string
  session_name: string
  start_time: string
  duration_minutes: number | null
  skipped_at?: string | null
}

export interface RunWrite {
  id: string
  patch: {
    start_time?: string
    skipped_at?: string | null
    skip_reason?: string | null
  }
}

const isSkipped = (s: RunSession) => !!s.skipped_at

/** To the minute: 10:06 reads as a decision, 10:06:43 reads as a machine. */
export function toTheMinute(now: number): string {
  const at = new Date(now)
  at.setSeconds(0, 0)
  return at.toISOString()
}

/**
 * The session the service is waiting on: the one running now, or failing
 * that the next one still to come. Skipped sessions are never it.
 */
export function frontIndex(sessions: RunSession[], now: number): number {
  let firstAhead = -1
  for (let i = 0; i < sessions.length; i += 1) {
    const s = sessions[i]
    if (isSkipped(s)) continue
    const start = new Date(s.start_time).getTime()
    if (Number.isNaN(start)) continue
    const end = start + Math.max(s.duration_minutes ?? 0, 0) * 60_000
    if (now >= start && now < end) return i
    if (start > now && firstAhead === -1) firstAhead = i
  }
  return firstAhead === -1 ? 0 : firstAhead
}

/**
 * Re-time everything from `index` onwards, starting at `startIso`.
 *
 * A skipped session still gets a place on the clock — it is where in the
 * service it was dropped — but contributes nothing, so the session after it
 * begins at the same moment.
 */
function cascade(sessions: RunSession[], index: number, startIso: string): Map<string, string> {
  const times = new Map<string, string>()
  let cursor = startIso
  for (let i = index; i < sessions.length; i += 1) {
    times.set(sessions[i].id, cursor)
    if (!isSkipped(sessions[i])) {
      cursor = addMinutesIso(cursor, Math.max(sessions[i].duration_minutes ?? 0, 0))
    }
  }
  return times
}

/** Only rows whose start actually moves are worth a write. */
function timeWrites(
  sessions: RunSession[],
  times: Map<string, string>,
  forced: Map<string, RunWrite['patch']>,
): RunWrite[] {
  const writes: RunWrite[] = []
  for (const session of sessions) {
    const next = times.get(session.id)
    const extra = forced.get(session.id)
    const moved = next !== undefined && next !== session.start_time
    if (!moved && !extra) continue
    writes.push({ id: session.id, patch: { ...(moved ? { start_time: next } : {}), ...extra } })
  }
  return writes
}

/**
 * The sessions that starting `index` would jump over.
 *
 * Everything from the front of the service up to it that has not already
 * been skipped — those are the ones that did not happen, and the dialog has
 * to name them before anybody agrees to it.
 */
export function jumpedSessions(sessions: RunSession[], index: number, now: number): RunSession[] {
  const front = frontIndex(sessions, now)
  if (index <= front) return []
  return sessions.slice(front, index).filter((s) => !isSkipped(s))
}

/**
 * "This session is starting now."
 *
 * It begins at this minute and everything after it follows. Anything jumped
 * over is marked skipped with the reason given — and the session it was
 * jumped from keeps its own start, so the difference between when it was due
 * to end and when the next thing actually began is its overrun.
 *
 * Starting a session that was itself skipped un-skips it: pressing the
 * button is a clearer statement than the earlier skip was.
 */
export function startAtPlan(
  sessions: RunSession[],
  index: number,
  now: number,
  reason: string | null = null,
): RunWrite[] {
  if (index < 0 || index >= sessions.length) return []
  const at = toTheMinute(now)

  const forced = new Map<string, RunWrite['patch']>()
  for (const skipped of jumpedSessions(sessions, index, now)) {
    forced.set(skipped.id, { skipped_at: at, skip_reason: reason?.trim() || null })
  }
  if (isSkipped(sessions[index])) {
    forced.set(sessions[index].id, { skipped_at: null, skip_reason: null })
  }

  // The cascade has to see the new skips, or a session skipped in this same
  // action would still be given its full length in the times that follow.
  const marked = sessions.map((s) =>
    forced.has(s.id) ? { ...s, skipped_at: forced.get(s.id)!.skipped_at ?? null } : s,
  )
  return timeWrites(sessions, cascade(marked, index, at), forced)
}

/**
 * "This session is not happening."
 *
 * Dropping the session the service is waiting on starts the next one at this
 * minute. Dropping one further down the plan does not drag the service
 * backwards — it keeps its slot and the sessions after it move up into the
 * time it was going to take.
 */
export function skipPlan(
  sessions: RunSession[],
  index: number,
  now: number,
  reason: string | null = null,
): RunWrite[] {
  if (index < 0 || index >= sessions.length) return []
  const at = toTheMinute(now)
  const live = index === frontIndex(sessions, now)

  const forced = new Map<string, RunWrite['patch']>([
    [sessions[index].id, { skipped_at: at, skip_reason: reason?.trim() || null }],
  ])
  const marked = sessions.map((s) => (s.id === sessions[index].id ? { ...s, skipped_at: at } : s))
  const anchor = live ? at : sessions[index].start_time
  return timeWrites(sessions, cascade(marked, index, anchor), forced)
}

/** Putting a skipped session back, with the plan closing up around it. */
export function unskipPlan(sessions: RunSession[], index: number): RunWrite[] {
  if (index < 0 || index >= sessions.length) return []
  const forced = new Map<string, RunWrite['patch']>([
    [sessions[index].id, { skipped_at: null, skip_reason: null }],
  ])
  const marked = sessions.map((s) =>
    s.id === sessions[index].id ? { ...s, skipped_at: null } : s,
  )
  return timeWrites(sessions, cascade(marked, index, sessions[index].start_time), forced)
}

/**
 * The writes that put things back exactly as they were.
 *
 * Taken before a plan is applied, from the same rows it is about to touch,
 * so undoing is a restore rather than an inverse operation someone had to
 * derive — and gets the fields right even where a plan changed three of them
 * on one row.
 */
export function snapshotFor(sessions: RunSession[], writes: RunWrite[]): RunWrite[] {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  return writes.flatMap((write) => {
    const before = byId.get(write.id)
    if (!before) return []
    const patch: RunWrite['patch'] = {}
    if ('start_time' in write.patch) patch.start_time = before.start_time
    if ('skipped_at' in write.patch) patch.skipped_at = before.skipped_at ?? null
    if ('skip_reason' in write.patch) {
      patch.skip_reason = (before as { skip_reason?: string | null }).skip_reason ?? null
    }
    return [{ id: write.id, patch }]
  })
}
