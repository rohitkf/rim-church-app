/**
 * The Countdown's clock, counting sessions taken by the same people as
 * one stretch of time.
 *
 * A speaker with "Message" and then "Message 1" is on the stage for both.
 * The clock counted to the end of the first, went red, and started again
 * for the second — so the one person it is for was told they were out of
 * time with half of it still to come. The Owner, November 2026: "If 2
 * sessions are done by same persons, let's show the combined time in
 * countdown page instead of that session's countdown."
 *
 * So where the sessions that follow the one that is on are taken by the
 * very same people, the clock counts on through them, to whatever comes
 * after the last of them (the next session somebody else takes, or the
 * end of the service). Two, or however many there are in a row.
 *
 * Only the Countdown page reads this. The Service Planner's rail and the
 * Dashboard keep each session's own clock (`serviceClock`): there the
 * running order is being run, session by session.
 *
 * "The same people" is whoever is taking the session, as a set: not the
 * order they are in, not who stands in, not who translates. A session
 * nobody is on is the same as nothing, so two unassigned sessions are not
 * joined.
 */
import { serviceBounds } from './serviceProgress'
import { peopleOn, refOf } from './sessionAssignees'
import type { ClockSession, ServiceClock } from './serviceClock'
import type { SessionAssignee } from './types'

export interface TakenSession extends ClockSession {
  assignees?: SessionAssignee[]
}

/** Who takes a session, as something two sessions can be compared by. */
function takers(session: TakenSession): string[] {
  return peopleOn(session)
    .map((person) => {
      const ref = refOf(person)
      return ref.id ? `${ref.kind}:${ref.id}` : ''
    })
    .filter(Boolean)
    .sort()
}

/** Whether two sessions are taken by exactly the same people, and by somebody. */
export function sameTakers(a: TakenSession, b: TakenSession): boolean {
  const one = takers(a)
  const other = takers(b)
  return one.length > 0 && one.length === other.length && one.every((key, i) => key === other[i])
}

export interface CombinedClock<S extends TakenSession> {
  /** The clock to draw: the service's own, or counting on through the sessions joined to the one that is on. */
  clock: ServiceClock<S>
  /** The session that is on and the ones after it counted with it, in order. One when nothing is joined; none in a gap. */
  joined: S[]
  /** When the stretch being counted began: the first session these people took in a row, epoch ms. Null in a gap. */
  from: number | null
}

/**
 * The service's clock (`serviceClock`, with `gaps`), counting on through
 * the sessions the same people take next.
 *
 * `sessions` is the running order as drawn; `endHeld` is "Not ended"
 * (services.end_held_at), which holds the last session on.
 */
export function combinedClock<S extends TakenSession>(sessions: S[], clock: ServiceClock<S>, endHeld = false): CombinedClock<S> {
  const current = clock.current
  if (!current) return { clock, joined: [], from: null }
  const live = sessions.filter((s) => !s.skipped_at)
  const at = live.findIndex((s) => s.id === current.id)
  if (at < 0) return { clock, joined: [current], from: new Date(current.start_time).getTime() }

  // Forwards: every session in a row that the same people take.
  let last = at
  while (last + 1 < live.length && sameTakers(live[last], live[last + 1])) last += 1
  // Backwards: where this stretch began, for how far through it they are.
  let first = at
  while (first > 0 && sameTakers(live[first - 1], live[first])) first -= 1

  const joined = live.slice(at, last + 1)
  const from = new Date(live[first].start_time).getTime()
  if (last === at) return { clock, joined, from }

  const next = live[last + 1] ?? null
  if (next) {
    return {
      // Held on only by the session after the stretch: one inside it not having started is these people still going.
      clock: { current, next, to: 'session', target: new Date(next.start_time).getTime(), holding: !!next.held_at },
      joined,
      from,
    }
  }
  const bounds = serviceBounds(sessions)
  if (!bounds) return { clock, joined: [current], from }
  return { clock: { current, next: null, to: 'end', target: bounds.to, holding: endHeld }, joined, from }
}

/** "Message 1", "Message 1 and Q&A", "Message 1, Q&A and Closing": the sessions counted with the one that is on. */
export function namesJoined(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
