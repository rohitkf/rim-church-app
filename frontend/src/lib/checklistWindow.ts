/**
 * When a checklist can be ticked.
 *
 * A tick means "I have done this thing, here, now". Ticked from an
 * armchair on a Thursday it means nothing at all — and that is what was
 * happening, because nothing stopped it. So the window is the one the
 * volunteers already work to: it opens at the team's call time on the day
 * of the service, and closes when the service finishes.
 *
 * The call time is the team's own, per day, and seven o'clock when nobody
 * has set one — the same rule the panel at the top of the rota shows, read
 * from the same table.
 *
 * This is the page's copy of a rule the database also holds (migration
 * 0079). Neither is decoration: the database is what actually refuses, and
 * this is what lets the page say so before somebody taps a box that was
 * never going to work. When they disagree, the database wins, and it reads
 * the call time in the church's own timezone while this reads it in the
 * viewer's — the same answer for everybody in the same city as the
 * building, which is everybody this is for.
 */
import { DEFAULT_CALL_TIME, callMoment, toClock, type CallTimeRow } from './callTimes'

export interface ChecklistWindow {
  /** Whether a box can be ticked right now. */
  open: boolean
  /** The moment it opens, ISO — what a countdown counts towards. */
  opensAt: string
  /** `HH:MM`, the team's call time that morning. */
  clock: string
  /** True when this is the seven o'clock nobody had to type. */
  isDefaultCallTime: boolean
}

/** This team's call time on this day, as stored, or null if none is set. */
export function callTimeOn(
  rows: CallTimeRow[],
  departmentId: string,
  onDate: string,
): string | null {
  const found = rows.find((r) => r.department_id === departmentId && r.on_date === onDate)
  return found ? toClock(found.call_time) : null
}

/**
 * The window for one team on one service day.
 *
 * `now` is passed rather than read, so the page decides how often the
 * answer is recomputed and a test can stand anywhere in the day.
 */
export function checklistWindow({
  serviceDate,
  departmentId,
  callTimes,
  now,
  alwaysOpen = false,
}: {
  serviceDate: string
  departmentId: string
  callTimes: CallTimeRow[]
  /** Milliseconds since the epoch. */
  now: number
  /** An Admin, who may put a service right before or after the fact. */
  alwaysOpen?: boolean
}): ChecklistWindow {
  const set = callTimeOn(callTimes, departmentId, serviceDate)
  const clock = set ?? DEFAULT_CALL_TIME
  const opensAt = callMoment(serviceDate, clock)
  return {
    open: alwaysOpen || now >= new Date(opensAt).getTime(),
    opensAt,
    clock,
    isDefaultCallTime: set === null,
  }
}

/**
 * What to tell somebody who cannot tick yet.
 *
 * Said as the two facts they need — the day and the time they are due —
 * rather than as a refusal. The countdown beside it does the rest.
 */
export function whenItOpens(window: ChecklistWindow, dayLabel: string): string {
  return `This checklist opens at ${window.clock} on ${dayLabel}, when your team is called in.`
}
