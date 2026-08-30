/**
 * How long a session was given, how much it was granted, and how long it
 * therefore runs.
 *
 * Three different numbers that used to be one. Folding granted time into the
 * planned length lost the figure next month's plan is built from — "we
 * planned 90 and ran 108" is a different thing to learn than "we planned
 * 108". So the plan's own length stays put and the grants sit beside it.
 *
 * Every calculation over the running order — the cascade, the rail, the
 * variance, the total — wants `runsFor`. Only the duration field wants
 * `planned`.
 */

export interface WithLength {
  duration_minutes: number | null
  added_minutes?: number | null
  added_grants?: TimeGrant[] | null
}

export interface TimeGrant {
  minutes: number
  note?: string | null
  at?: string
}

/** The length the running order was written with. */
export function plannedMinutes(session: WithLength): number {
  return Math.max(session.duration_minutes ?? 0, 0)
}

/** What was handed over during the service, on request. */
export function grantedMinutes(session: WithLength): number {
  return Math.max(session.added_minutes ?? 0, 0)
}

/** What the session actually occupies: the plan plus whatever it was given. */
export function runsForMinutes(session: WithLength): number {
  return plannedMinutes(session) + grantedMinutes(session)
}

/** The grants themselves, in the order they were given, largest first on ties. */
export function grantsOf(session: WithLength): TimeGrant[] {
  return (session.added_grants ?? []).filter((g) => g && g.minutes > 0)
}
