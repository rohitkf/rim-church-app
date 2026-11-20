import { addDays } from './dateRange'
import { effectiveCallTime, serviceDays, type CallTimeRow, type DatedService } from './callTimes'
import { shortServiceDay } from './sunday'

/**
 * A person's own call times, for the Dashboard.
 *
 * The Team Rota has every team's call time, and the phone is told on
 * Saturday evening. The Dashboard is the page people actually open, and it
 * said when the service starts and never when *they* are due — so this is
 * the answer to "what time do I need to be there", for the teams they are
 * on, until the moment it stops being a thing to plan around.
 *
 * Which is the call time itself: once it has passed, the time is either
 * kept or missed, and what the Dashboard wants from them next is the Clock
 * in button. Each team goes at its own time, so somebody on Sound at 06:30
 * and Worship at 07:00 still sees Worship at 06:45.
 *
 * How far ahead it shows, how long it lingers and who it is for are the
 * church's (Settings › Page by Page › Dashboard, lib/display).
 */

export interface MyCall {
  id: string
  name: string
  color: string | null
  /** `HH:MM`. */
  clock: string
  /** The same, as a moment. */
  at: string
  /** True when nobody set one and this is the usual time. */
  isDefault: boolean
}

export interface MyCallDay<S extends DatedService = DatedService> {
  date: string
  /** Everything on that day: one call time covers all of it. */
  services: S[]
  /** My teams still to be called, earliest first. */
  teams: MyCall[]
}

export function myCallTimes<S extends DatedService>({
  services,
  rows,
  teams,
  mine,
  onRota,
  today,
  now,
  days,
  stayMinutes,
}: {
  services: S[]
  /** Call times anybody has set, for any of the days in question. */
  rows: CallTimeRow[]
  /** The teams this person can see. */
  teams: { id: string; name: string; color: string | null }[]
  /** The teams they are on or head. */
  mine: string[]
  /**
   * Their places on the rota as `service:team`, when the church shows
   * call times only to whoever was put on; null when it is everybody on
   * the team.
   */
  onRota: Set<string> | null
  /** Today's date, `YYYY-MM-DD`. */
  today: string
  now: number
  /** How many days before a service day it appears; 0 is the day itself. */
  days: number
  /** Minutes after a call time that it stays. */
  stayMinutes: number
}): MyCallDay<S>[] {
  const last = addDays(today, days)
  const ahead = services.filter((s) => s.date >= today && s.date <= last)
  const out: MyCallDay<S>[] = []

  for (const day of serviceDays(ahead)) {
    const setThatDay = rows.filter((r) => r.on_date === day.date)
    const called = onRota
      ? // Whoever the rota put on, on the team it put them on — theirs or not.
        teams.filter((t) => day.services.some((s) => onRota.has(`${s.id}:${t.id}`)))
      : teams.filter((t) => mine.includes(t.id))
    const still = called
      .map((t): MyCall => ({ id: t.id, name: t.name, color: t.color, ...effectiveCallTime(setThatDay, t.id, day.date) }))
      .filter((t) => now < new Date(t.at).getTime() + stayMinutes * 60_000)
      .sort((a, b) => (a.clock !== b.clock ? (a.clock < b.clock ? -1 : 1) : a.name.localeCompare(b.name)))
    if (still.length > 0) out.push({ date: day.date, services: day.services, teams: still })
  }
  return out
}

/** "Today", "Tomorrow", or the day by name. */
export function relativeDay(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return shortServiceDay(date)
}
