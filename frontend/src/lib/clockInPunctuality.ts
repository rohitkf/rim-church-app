/**
 * How somebody's arrivals have gone: each clock-in held against the call
 * time it was for (0280).
 *
 * A clock-in keeps the person's call time as it stood that day
 * (`clock_ins.call_at`), so "how long after the call" is a subtraction and
 * stays answerable after the day's rota has been cleared away. Three
 * things read it: the day's list (late in red, first), each person's
 * record over the weeks kept, and the chart of it.
 *
 * Late is the church's number (`clock_in_late_minutes`, 30 out of the
 * box): that long after the call, or more. A call time that is not known
 * — somebody added for a day whose services had gone, somebody on no rota
 * — is never late and never on time; it is counted as a clock-in and
 * left out of the sums.
 */

export interface Timed {
  clocked_at: string
  /** Null or missing: not known. */
  call_at?: string | null
}

/** Whole minutes from the call to the clock-in: negative before it, null when the call is not known. */
export function minutesAfterCall(row: Timed): number | null {
  if (!row.call_at) return null
  const call = Date.parse(row.call_at)
  const clocked = Date.parse(row.clocked_at)
  if (!Number.isFinite(call) || !Number.isFinite(clocked)) return null
  return Math.round((clocked - call) / 60_000)
}

export function isLate(row: Timed, lateAfter: number): boolean {
  const minutes = minutesAfterCall(row)
  return minutes !== null && minutes >= lateAfter
}

/**
 * The day's list in the order it is read: whoever is late first, the
 * latest of them at the top, then everybody else as they arrived.
 */
export function sortForDay<T extends Timed>(rows: readonly T[], lateAfter: number): T[] {
  const late = rows.filter((r) => isLate(r, lateAfter))
  const rest = rows.filter((r) => !isLate(r, lateAfter))
  late.sort((a, b) => (minutesAfterCall(b) ?? 0) - (minutesAfterCall(a) ?? 0) || b.clocked_at.localeCompare(a.clocked_at))
  rest.sort((a, b) => a.clocked_at.localeCompare(b.clocked_at))
  return [...late, ...rest]
}

/** "45 min", "1 h", "2 h 10 min": a length of time, never negative. */
export function spanWords(minutes: number): string {
  const whole = Math.abs(Math.round(minutes))
  if (whole < 60) return `${whole} min`
  const h = Math.floor(whole / 60)
  const m = whole % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Where a clock-in fell against its call: "12 min before call", "at call time", "47 min after call". */
export function againstCallWords(minutes: number | null): string {
  if (minutes === null) return 'Call time not known'
  if (minutes === 0) return 'At call time'
  return minutes < 0 ? `${spanWords(minutes)} before call` : `${spanWords(minutes)} after call`
}

export interface Arrival extends Timed {
  on_date: string
  call_at: string | null
  minutes: number | null
  late: boolean
}

export interface PersonRecord {
  userId: string
  name: string
  /** Oldest first: the order a chart reads. */
  arrivals: Arrival[]
  /** Every clock-in kept. */
  count: number
  /** Those whose call time is known: what the sums are over. */
  known: number
  late: number
  /** The middle one of the known ones, in minutes after the call; null with none known. */
  typical: number | null
}

/** The middle value: one freak morning does not move it, which an average would. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/**
 * Everybody's record over the clock-ins kept, the people who are late
 * most often first — the ones somebody opens this to find — then by name.
 */
export function punctualityByPerson(
  rows: readonly (Timed & { user_id: string; on_date: string; person?: { first_name: string; last_name: string } | null })[],
  lateAfter: number,
): PersonRecord[] {
  const byPerson = new Map<string, PersonRecord>()
  for (const row of rows) {
    const minutes = minutesAfterCall(row)
    const record =
      byPerson.get(row.user_id) ??
      ({
        userId: row.user_id,
        name: row.person ? `${row.person.first_name} ${row.person.last_name}`.trim() : 'Somebody',
        arrivals: [],
        count: 0,
        known: 0,
        late: 0,
        typical: null,
      } satisfies PersonRecord)
    byPerson.set(row.user_id, record)
    record.arrivals.push({
      on_date: row.on_date,
      clocked_at: row.clocked_at,
      call_at: row.call_at ?? null,
      minutes,
      late: minutes !== null && minutes >= lateAfter,
    })
  }
  const records = [...byPerson.values()]
  for (const record of records) {
    record.arrivals.sort((a, b) => a.on_date.localeCompare(b.on_date) || a.clocked_at.localeCompare(b.clocked_at))
    const known = record.arrivals.flatMap((a) => (a.minutes === null ? [] : [a.minutes]))
    record.count = record.arrivals.length
    record.known = known.length
    record.late = record.arrivals.filter((a) => a.late).length
    record.typical = median(known)
  }
  return records.sort((a, b) => b.late - a.late || a.name.localeCompare(b.name))
}

/** "1 late of 6", "on time all 6", "6 clock-ins" when no call time is known. */
export function recordWords(record: Pick<PersonRecord, 'count' | 'known' | 'late'>): string {
  const clockIns = `${record.count} ${record.count === 1 ? 'clock-in' : 'clock-ins'}`
  if (record.known === 0) return clockIns
  if (record.late === 0) return record.count === 1 ? 'On time, 1 clock-in' : `On time, all ${record.count} clock-ins`
  return `${record.late} late of ${record.count}`
}

/** What "usually" is, said of the middle arrival: "Usually 12 min before call". */
export function typicalWords(typical: number | null): string | null {
  if (typical === null) return null
  if (typical === 0) return 'Usually at call time'
  return `Usually ${spanWords(typical)} ${typical < 0 ? 'before' : 'after'} call`
}

/** How far back is kept, as somebody would say it: 28 days is "4 weeks", 30 is "30 days". */
export function windowWords(days: number): string {
  if (days % 7 === 0) {
    const weeks = days / 7
    return weeks === 1 ? 'week' : `${weeks} weeks`
  }
  return days === 1 ? 'day' : `${days} days`
}

/** The first day inside the window: today less the days kept, as the nightly clear counts them. */
export function windowStart(todayIso: string, days: number): string {
  const [y, m, d] = todayIso.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d - days))
  return start.toISOString().slice(0, 10)
}

/**
 * Where a bar ends on the chart's scale, as a share of the plot's height
 * from the call-time line: positive upward (after the call), negative
 * downward (before it). Beyond the scale it stops at the edge and says
 * so (`over`), so one four-hour morning does not flatten every other bar.
 */
export const CHART_EARLY_MIN = 60
export const CHART_LATE_MIN = 120

export function barExtent(minutes: number): { share: number; over: boolean } {
  if (minutes >= 0) {
    const over = minutes > CHART_LATE_MIN
    return { share: Math.min(minutes, CHART_LATE_MIN) / (CHART_EARLY_MIN + CHART_LATE_MIN), over }
  }
  const over = -minutes > CHART_EARLY_MIN
  return { share: -Math.min(-minutes, CHART_EARLY_MIN) / (CHART_EARLY_MIN + CHART_LATE_MIN), over }
}
