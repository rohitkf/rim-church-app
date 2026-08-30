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

export function serviceStanding(
  sessions: SessionTiming[],
  now: number = Date.now(),
  /** When the end was called, if it was. */
  endedAt?: string | null,
): ServiceStanding {
  const bounds = serviceBounds(sessions)
  const called = endedAt ? new Date(endedAt).getTime() : NaN
  if (!Number.isNaN(called) && now >= called) {
    return { state: 'done', from: bounds?.from ?? called, to: called }
  }
  if (!bounds) return { state: 'unplanned', from: null, to: null }
  if (now >= bounds.to) return { state: 'done', from: bounds.from, to: bounds.to }
  if (now >= bounds.from) return { state: 'running', from: bounds.from, to: bounds.to }
  return { state: 'upcoming', from: bounds.from, to: bounds.to }
}

/** Where a service belongs in the day's running list. Lower comes first. */
const RANK: Record<ServiceState, number> = {
  running: 0,
  upcoming: 1,
  unplanned: 2,
  done: 3,
}

/**
 * The day's services in the order they deserve attention: whatever is on
 * right now, then what is still to come, then anything with no running
 * order, and finished services last. Within a group the earlier one leads,
 * so two services still ahead stay in the order they will happen.
 */
export function orderServices<T>(
  services: T[],
  standingOf: (service: T) => ServiceStanding,
): T[] {
  return [...services].sort((a, b) => {
    const sa = standingOf(a)
    const sb = standingOf(b)
    if (RANK[sa.state] !== RANK[sb.state]) return RANK[sa.state] - RANK[sb.state]
    return (sa.from ?? Infinity) - (sb.from ?? Infinity)
  })
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
): number | null {
  const called = endedAt ? new Date(endedAt).getTime() : NaN
  if (!Number.isNaN(called)) return called + EDIT_GRACE_MS
  const bounds = serviceBounds(sessions)
  return bounds ? bounds.to + EDIT_GRACE_MS : null
}

/** Whether the running order has settled into a record that cannot change. */
export function editingLocked(
  sessions: SessionTiming[],
  now: number = Date.now(),
  endedAt?: string | null,
): boolean {
  const at = editingLocksAt(sessions, endedAt)
  return at !== null && now >= at
}
