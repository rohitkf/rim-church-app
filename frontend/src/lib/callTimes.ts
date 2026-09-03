/**
 * When each team is due at the building.
 *
 * A call time is not a service time and it is not per service: the
 * volunteers come in once, before anything starts, and set the building
 * up — then the day runs, whatever is on it. A Sunday with an English
 * service and a Malayalam service has one call time per team, not two.
 * The database was keyed by service until 0076 and said otherwise, which
 * is a fact about a schema that nobody in the building would recognise.
 *
 * So a call time belongs to a team and a date, and is a wall-clock time:
 * "seven o'clock" is what a team is told and what it means.
 *
 * Everyone signed in can read every team's, which is deliberate and
 * already what the database says — knowing that Worship is called at
 * eight is how whoever opens up knows who to expect. Setting one is the
 * team's own business: its Head, its Assisting Head, or an Admin.
 */

export interface CallTimeRow {
  department_id: string
  on_date: string
  /** `HH:MM` or `HH:MM:SS`, as Postgres `time` comes back. */
  call_time: string
}

/** A team, as much of one as this module needs. */
export interface CallTimeTeam {
  id: string
  name: string
}

/**
 * When a team is due if nobody has said otherwise.
 *
 * Seven is the answer for this church, and it is the answer for almost
 * every team almost every week — so the panel is right on the day it ships
 * with nothing typed into it, and setting a call time becomes the
 * exception it actually is rather than eight chores before the feature
 * says anything at all.
 *
 * A constant here rather than a row in `app_settings`, which is where the
 * church's other clocks live and where this one belongs the moment a
 * second church uses this app, or this one changes its mind. Moving it is
 * a migration and a field on the settings page; it is not this change.
 */
export const DEFAULT_CALL_TIME = '07:00'

/** A team's call time, and whether anybody actually chose it. */
export interface EffectiveCallTime {
  /** `HH:MM`, always — the default is a real time, not an absence. */
  clock: string
  /** The same time as a moment, for counting down to. */
  at: string
  /** True when this is the seven o'clock nobody had to type. */
  isDefault: boolean
}

/** `HH:MM`, whether Postgres sent seconds along with it or not. */
export function toClock(time: string): string {
  return time.slice(0, 5)
}

/** This team's call time on this day, exactly as stored, or null. */
export function callTimeFor(rows: CallTimeRow[], departmentId: string): string | null {
  const found = rows.find((r) => r.department_id === departmentId)
  return found ? toClock(found.call_time) : null
}

/**
 * That wall-clock time on that morning, as a moment.
 *
 * Built in whoever is reading's own zone, which is right for a church
 * whose volunteers are in the same city as the building. Somebody reading
 * from another country sees the countdown to seven o'clock their time,
 * which is wrong for them and right for everyone this is for.
 */
export function callMoment(onDate: string, clock: string): string {
  return new Date(`${onDate}T${clock}:00`).toISOString()
}

/** What time this team is due on this day, set or not. */
export function effectiveCallTime(
  rows: CallTimeRow[],
  departmentId: string,
  onDate: string,
): EffectiveCallTime {
  const set = callTimeFor(rows, departmentId)
  const clock = set ?? DEFAULT_CALL_TIME
  return { clock, at: callMoment(onDate, clock), isDefault: set === null }
}

/**
 * The order the teams are read in.
 *
 * Yours first — you opened this to find out when *you* are due, and a
 * panel that makes you hunt for your own team among eight has answered
 * somebody else's question. Then earliest first, because that is the shape
 * of a morning: whoever is in first, first. A team on the default sorts on
 * the default, since seven o'clock is when they are due — there is no
 * "unset" pile any more, which is the point of having a default at all.
 */
export function orderTeamsForCallTimes<T extends CallTimeTeam>(
  teams: T[],
  rows: CallTimeRow[],
  mine: Set<string>,
  onDate: string,
): T[] {
  const at = (id: string) => effectiveCallTime(rows, id, onDate).clock
  return [...teams].sort((a, b) => {
    const aMine = mine.has(a.id) ? 0 : 1
    const bMine = mine.has(b.id) ? 0 : 1
    if (aMine !== bMine) return aMine - bMine

    const aAt = at(a.id)
    const bAt = at(b.id)
    if (aAt !== bAt) return aAt < bAt ? -1 : 1

    return a.name.localeCompare(b.name)
  })
}

/**
 * The call time to put in the header: the earliest of your own, since that
 * is the one that decides when you leave the house.
 *
 * Null only when you serve on no team at all — a head looking at a team
 * they run but do not serve on has nothing personal to be counted down to,
 * and inventing one would be worse than saying nothing.
 */
export function myNextCallTime(
  rows: CallTimeRow[],
  mine: Set<string>,
  onDate: string,
): EffectiveCallTime | null {
  const ours = [...mine].map((id) => effectiveCallTime(rows, id, onDate))
  if (ours.length === 0) return null
  return ours.reduce((soonest, r) => (r.clock < soonest.clock ? r : soonest))
}

export interface DatedService {
  id: string
  date: string
  service_type: string
}

/** A day the church has something on, and what it has on. */
export interface ServiceDay {
  date: string
  services: DatedService[]
}

/**
 * The days ahead, each with everything happening on it.
 *
 * The panel is about a morning rather than a service, so this is the unit
 * it works in — and it is why the services are named on the panel at all:
 * "you are due at seven" makes sense once you can see it is the Sunday
 * with two services on it.
 */
export function serviceDays(services: DatedService[]): ServiceDay[] {
  const byDate = new Map<string, DatedService[]>()
  for (const service of services) {
    const held = byDate.get(service.date)
    if (held) held.push(service)
    else byDate.set(service.date, [service])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, list]) => ({ date, services: list }))
}
