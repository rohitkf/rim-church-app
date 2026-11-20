import { addDays } from './dateRange'
import { effectiveCallTime, serviceDays, type CallTimeRow, type DatedService } from './callTimes'
import { shortServiceDay } from './sunday'

/**
 * A person's own call time, for the Dashboard.
 *
 * The Team Rota has every team's call time, and the phone is told on
 * Saturday evening. The Dashboard is the page people actually open, and it
 * said when the service starts and never when *they* are due — so this is
 * the answer to "what time do I need to be there".
 *
 * One answer, not a list: today's, if there is a service today, otherwise
 * the next service day's. The first version listed every service day in
 * the week ahead, and the Owner's word on it was that he wanted to see one
 * call time, not the future's. So the day after next Sunday is not
 * mentioned until next Sunday is over.
 *
 * It goes at the call time itself: once that has passed, the time is
 * either kept or missed, and what the Dashboard wants from them next is
 * the Clock in button. Nothing takes its place for the rest of that day —
 * a card that vanished at seven and came back at once with next week's
 * time would not have gone at all.
 *
 * Somebody on two teams called at the same time is told that time once,
 * with both teams beside it. Only teams called at different times make a
 * second line, and each goes at its own time.
 *
 * How far ahead it shows, how long it lingers and who it is for are the
 * church's (Settings › Page by Page › Dashboard, lib/display).
 */

export interface MyCall {
  /** `HH:MM`. */
  clock: string
  /** The same, as a moment. */
  at: string
  /** The teams called for that time, by name. */
  teams: { id: string; name: string; color: string | null }[]
}

export interface MyCallDay<S extends DatedService = DatedService> {
  date: string
  /** Everything on that day: one call time covers all of it. */
  services: S[]
  /** The times still to come, earliest first: one, unless my teams are called at different times. */
  calls: MyCall[]
}

export function myCallTime<S extends DatedService>({
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
}): MyCallDay<S> | null {
  const last = addDays(today, days)
  const ahead = services.filter((s) => s.date >= today && s.date <= last)

  for (const day of serviceDays(ahead)) {
    const called = onRota
      ? // Whoever the rota put on, on the team it put them on — theirs or not.
        teams.filter((t) => day.services.some((s) => onRota.has(`${s.id}:${t.id}`)))
      : teams.filter((t) => mine.includes(t.id))
    // A day they are not called on is not their next one.
    if (called.length === 0) continue

    // This is the day, whether or not its times have passed: nothing later is looked at.
    const setThatDay = rows.filter((r) => r.on_date === day.date)
    const calls: MyCall[] = []
    for (const team of [...called].sort((a, b) => a.name.localeCompare(b.name))) {
      const { clock, at } = effectiveCallTime(setThatDay, team.id, day.date)
      if (now >= new Date(at).getTime() + stayMinutes * 60_000) continue
      const same = calls.find((c) => c.clock === clock)
      const mark = { id: team.id, name: team.name, color: team.color }
      if (same) same.teams.push(mark)
      else calls.push({ clock, at, teams: [mark] })
    }
    calls.sort((a, b) => (a.clock < b.clock ? -1 : 1))
    return calls.length > 0 ? { date: day.date, services: day.services, calls } : null
  }
  return null
}

/** "Today", "Tomorrow", or the day by name. */
export function relativeDay(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return shortServiceDay(date)
}
