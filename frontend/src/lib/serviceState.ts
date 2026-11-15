/**
 * Where a service stands against the clock.
 *
 * A service isn't a date, it's a window: the first session's start to the
 * last session's end. Knowing which side of that window "now" falls on is
 * what lets the dashboard stop calling a service that started an hour ago
 * the "next" one, and lets a finished service get out of the way of the
 * one still to come.
 *
 * Mostly nothing is stored for this. The running order already says when
 * every session starts and how long it runs, so completion is a fact about
 * the clock rather than a flag someone has to remember to set — which means
 * it is right for everyone at once, needs no job to keep it true, and can
 * never drift from the plan it describes.
 *
 * The exception is a service somebody has called the end of. A service that
 * closes fifteen minutes early is over at the moment it is called, not at the
 * moment its plan said it would be, and no amount of arithmetic over the plan
 * can know that. So `endedAt`, when it is set, wins.
 *
 * And the other way round: a service whose plan has run out is not over
 * while somebody is saying it is not. A session marked "Not started"
 * (held_at) means the one before it is still going; the service marked
 * "Not ended" (services.end_held_at, 0292) means the last one is. Either
 * holds the service open past its planned end — it was filed under
 * Finished with a session still waiting to start, twenty minutes into an
 * overrun (15 November 2026). The hold is believed for six hours past the
 * planned end and no longer, so one that was never cleared does not keep a
 * Sunday open until Tuesday. The database's lock goes by the same rule
 * (service_has_finished, 0294).
 */
import { serviceBounds, type SessionTiming } from './serviceProgress'

export type ServiceState =
  /** Between the first session's start and the last one's end. */
  | 'running'
  /** The last session's end has passed. */
  | 'done'
  /** Planned, and still ahead. */
  | 'upcoming'
  /** No running order yet, so there are no times to judge it by. */
  | 'unplanned'

export interface ServiceStanding {
  state: ServiceState
  /** When it starts, in epoch ms; null when nothing is planned. */
  from: number | null
  /** When it ends, in epoch ms; null when nothing is planned. */
  to: number | null
}

/** How long past the planned end a hold is believed: "Not started" on a session, "Not ended" on the service. */
export const HOLD_BELIEVED_MS = 6 * 60 * 60 * 1000

/**
 * Whether somebody is holding the service open past its plan: a session
 * that runs is marked not started, or the service is marked not ended —
 * and the planned end is less than six hours gone. Nothing to do with a
 * service the end has been called on; `serviceStanding` asks that first.
 */
export function heldOpen(
  sessions: SessionTiming[],
  now: number = Date.now(),
  /** services.end_held_at: when "Not ended" was pressed, if it is on. */
  endHeldAt?: string | null,
): boolean {
  const bounds = serviceBounds(sessions)
  if (!bounds || now >= bounds.to + HOLD_BELIEVED_MS) return false
  return !!endHeldAt || sessions.some((s) => !s.skipped_at && !!s.held_at)
}

export function serviceStanding(
  sessions: SessionTiming[],
  now: number = Date.now(),
  /** When the end was called, if it was. */
  endedAt?: string | null,
  /** services.end_held_at: "Not ended" is on. */
  endHeldAt?: string | null,
): ServiceStanding {
  const bounds = serviceBounds(sessions)
  const called = endedAt ? new Date(endedAt).getTime() : NaN
  if (!Number.isNaN(called) && now >= called) {
    return { state: 'done', from: bounds?.from ?? called, to: called }
  }
  if (!bounds) return { state: 'unplanned', from: null, to: null }
  if (now >= bounds.to) {
    // The plan has run out. It is over unless somebody says it is not.
    return { state: heldOpen(sessions, now, endHeldAt) ? 'running' : 'done', from: bounds.from, to: bounds.to }
  }
  if (now >= bounds.from) return { state: 'running', from: bounds.from, to: bounds.to }
  return { state: 'upcoming', from: bounds.from, to: bounds.to }
}

/**
 * How long after a service ends an Admin can still correct the record.
 *
 * Long enough to walk off a stage, find your phone and fix what you noticed;
 * short enough that a service is settled by the time anyone comes back to it.
 * Matched by `service_has_finished` in the database, which is the actual
 * lock — this only decides whether the page offers the buttons.
 */
export const EDIT_GRACE_MS = 60 * 60 * 1000

/**
 * The moment the running order stops accepting changes: an hour after the
 * end that was called, or failing that an hour after the last session was
 * due to finish.
 *
 * `null` when there is nothing to go on — a service with no running order
 * and no end has not finished, so nothing is closing.
 */
export function editingLocksAt(
  sessions: SessionTiming[],
  endedAt?: string | null,
  graceMs: number = EDIT_GRACE_MS,
  /** services.end_held_at: "Not ended" is on. */
  endHeldAt?: string | null,
): number | null {
  const called = endedAt ? new Date(endedAt).getTime() : NaN
  if (!Number.isNaN(called)) return called + graceMs
  const bounds = serviceBounds(sessions)
  if (!bounds) return null
  // Held open, the plan's end is not the end: nothing locks until the
  // hold is no longer believed (and the grace has long gone by then).
  const held = !!endHeldAt || sessions.some((s) => !s.skipped_at && !!s.held_at)
  return held ? bounds.to + Math.max(graceMs, HOLD_BELIEVED_MS) : bounds.to + graceMs
}

/** Whether the running order has settled into a record that cannot change. */
export function editingLocked(
  sessions: SessionTiming[],
  now: number = Date.now(),
  endedAt?: string | null,
  graceMs: number = EDIT_GRACE_MS,
  endHeldAt?: string | null,
): boolean {
  const at = editingLocksAt(sessions, endedAt, graceMs, endHeldAt)
  return at !== null && now >= at
}
