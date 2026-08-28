/**
 * Where a service stands against the clock.
 *
 * A service isn't a date, it's a window: the first session's start to the
 * last session's end. Knowing which side of that window "now" falls on is
 * what lets the dashboard stop calling a service that started an hour ago
 * the "next" one, and lets a finished service get out of the way of the
 * one still to come.
 *
 * Nothing is stored for this. The running order already says when every
 * session starts and how long it runs, so completion is a fact about the
 * clock rather than a flag someone has to remember to set — which means it
 * is right for everyone at once, needs no job to keep it true, and can
 * never drift from the plan it describes.
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
): ServiceStanding {
  const bounds = serviceBounds(sessions)
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
