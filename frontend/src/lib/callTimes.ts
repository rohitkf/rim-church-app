/**
 * When each team is due at the building.
 *
 * A call time is not the service time: the band is in at eight for a
 * service at ten, and the ushers at half nine. It is the one fact a
 * volunteer needs the night before, and until now the app has not carried
 * it — `department_call_times` has existed since the first migration with
 * nothing on either side of it, no way to set one and nothing that read
 * one. So the whole church has been told its call times by WhatsApp.
 *
 * Everyone signed in can read every team's, which is deliberate and
 * already what the database says: knowing that Worship is called at eight
 * is how the person locking up knows who will be at the door. Setting one
 * is the team's own business — its Head, its Assisting Head, or an Admin.
 */

export interface CallTimeRow {
  department_id: string
  service_id: string
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
  /** An ISO moment, always — the default is a real time, not an absence. */
  at: string
  /** True when this is the seven o'clock nobody had to type. */
  isDefault: boolean
}

/**
 * What time this team is due, set or not.
 *
 * The default is built on the service's own date, so it lands on the right
 * morning rather than on today — a panel opened on Thursday about Sunday
 * would otherwise count down to a seven o'clock that has already been and
 * gone.
 */
export function effectiveCallTime(
  rows: CallTimeRow[],
  departmentId: string,
  serviceDate: string,
): EffectiveCallTime {
  const set = callTimeFor(rows, departmentId)
  if (set) return { at: set, isDefault: false }
  return { at: defaultCallTimeOn(serviceDate), isDefault: true }
}

/** The default, as a moment on a given day, in whatever zone the reader is in. */
export function defaultCallTimeOn(serviceDate: string): string {
  return new Date(`${serviceDate}T${DEFAULT_CALL_TIME}:00`).toISOString()
}

/** This team's call time for the service these rows are about, or null. */
export function callTimeFor(rows: CallTimeRow[], departmentId: string): string | null {
  return rows.find((r) => r.department_id === departmentId)?.call_time ?? null
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
  serviceDate: string,
): T[] {
  const at = (id: string) => effectiveCallTime(rows, id, serviceDate).at
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
 * The call time to put in the collapsed header: the earliest of your own,
 * since that is the one that decides when you leave the house.
 *
 * Null only when you serve on no team at all — a head looking at a team
 * they run but do not serve on has nothing personal to be counted down to,
 * and inventing one would be worse than saying nothing.
 */
export function myNextCallTime(
  rows: CallTimeRow[],
  mine: Set<string>,
  serviceDate: string,
): EffectiveCallTime | null {
  const ours = [...mine].map((id) => effectiveCallTime(rows, id, serviceDate))
  if (ours.length === 0) return null
  return ours.reduce((soonest, r) => (r.at < soonest.at ? r : soonest))
}
