import type { AppSettings } from './appSettings'
import { nextBoardClearTime } from './boardClear'

/**
 * How long each page's contents last, said once.
 *
 * Several things in the app go away on a clock — the message board and
 * the activity feed on the clear day, debrief minutes after a set number
 * of days, a checklist's halves at the end of a service — and until now a
 * page said so only sometimes, in its own words, with the day sometimes
 * written into the sentence rather than read from App settings. So when a
 * setting changed, the page went on telling people the old rule.
 *
 * Every sentence is built here from the settings the database also reads,
 * so a page cannot promise a different day than the job that clears it.
 */

type Settings = Pick<
  AppSettings,
  | 'board_clear_dow'
  | 'debrief_retention_days'
  | 'issue_retention_days'
  | 'issue_open_minutes_before'
  | 'issue_close_minutes_after'
  | 'debrief_open_minutes_after'
  | 'edit_grace_minutes'
  | 'after_service_checklist_minutes'
  | 'availability_closes_time'
  | 'team_chat_retention_days'
  | 'church_update_retention_days'
  | 'poll_retention_days'
> & {
  /** How far either side of today Set Lists looks (a display preference). */
  set_list_days: number
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * The shipped values, for any field a partial settings row leaves out —
 * the sentence should fall back to what the database defaults to, not to
 * "undefined days".
 */
const FALLBACK: Settings = {
  board_clear_dow: 2,
  debrief_retention_days: 30,
  issue_retention_days: 30,
  issue_open_minutes_before: 60,
  issue_close_minutes_after: 120,
  debrief_open_minutes_after: 720,
  edit_grace_minutes: 60,
  after_service_checklist_minutes: 120,
  availability_closes_time: '23:59:00',
  team_chat_retention_days: null,
  church_update_retention_days: null,
  poll_retention_days: null,
  set_list_days: 21,
}

/** 120 → "2 hours", 90 → "1 hour 30 minutes", 0 → "no time at all". */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return 'no time at all'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const hours = h === 0 ? '' : `${h} ${h === 1 ? 'hour' : 'hours'}`
  const mins = m === 0 ? '' : `${m} ${m === 1 ? 'minute' : 'minutes'}`
  return [hours, mins].filter(Boolean).join(' ')
}

/** The clear moment in the reader's own clock: "Tuesday at 01:00". */
export function boardClearsAt(settings: Pick<Settings, 'board_clear_dow'>, now = new Date()): string {
  const at = nextBoardClearTime(now, settings.board_clear_dow)
  const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const day = at.toLocaleDateString(undefined, { weekday: 'long' })
  return `${day} at ${time}`
}

export type LifespanPage =
  | 'messages'
  | 'activity'
  | 'debriefs'
  | 'checklists'
  | 'availability'
  | 'rota'
  | 'planner'
  | 'set-lists'
  | 'polls'
  | 'updates'
  | 'team-chat'
  | 'issues'

export function lifespanOf(page: LifespanPage, given: Partial<Settings>, now = new Date()): string {
  const s: Settings = { ...FALLBACK }
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  const span = (n: number) => (n % 7 === 0 ? `${n / 7} ${n === 7 ? 'week' : 'weeks'}` : days(n))
  for (const key of Object.keys(FALLBACK) as (keyof Settings)[]) {
    if (given[key] !== undefined && given[key] !== null) (s as Record<string, unknown>)[key] = given[key]
  }
  const clearDay = WEEKDAYS[s.board_clear_dow]
  const grace = formatMinutes(s.edit_grace_minutes)
  switch (page) {
    case 'messages':
      return `Every post is deleted each ${boardClearsAt(s, now)}, along with its notifications.`
    case 'activity':
      return `The activity feed clears each ${clearDay}, with the message board.`
    case 'debriefs':
      return `A team can write its debrief for ${formatMinutes(s.debrief_open_minutes_after)} after the service ends (Heads and Admins, any time). Minutes are deleted ${s.debrief_retention_days} ${s.debrief_retention_days === 1 ? 'day' : 'days'} after their service.`
    case 'checklists':
      return `“Before the service” closes when the service ends; “After the service” stays open ${formatMinutes(s.after_service_checklist_minutes)} longer. Ticks are kept as a record.`
    case 'availability':
      return `Answers close at ${s.availability_closes_time.slice(0, 5)} the night before each service, and are kept afterwards.`
    case 'rota':
      return `A service’s rota locks ${grace} after it ends, and is kept as a record.`
    case 'planner':
      return `Finished services leave this list each ${clearDay} and stay in the calendar. A running order locks ${grace} after its service ends.`
    case 'set-lists':
      return `Shows ${span(s.set_list_days)} either side of today. A set list locks when its service finishes; nothing is deleted.`
    case 'polls':
      return s.poll_retention_days === null
        ? 'Polls stay until they are deleted. Answers lock at a poll’s deadline, if it has one.'
        : `A poll is deleted ${days(s.poll_retention_days)} after it closes (or after it was made, if it never closes). Answers lock at a poll’s deadline, if it has one.`
    case 'updates':
      return s.church_update_retention_days === null
        ? 'Updates stay until an Admin deletes them.'
        : `An update is deleted ${days(s.church_update_retention_days)} after it is posted, unless it is pinned.`
    case 'team-chat':
      return s.team_chat_retention_days === null
        ? 'Nothing here clears on its own — messages stay until they are deleted.'
        : `Messages are deleted ${days(s.team_chat_retention_days)} after they are posted.`
    case 'issues':
      return `Issues can be raised from ${formatMinutes(s.issue_open_minutes_before)} before a service starts until ${formatMinutes(s.issue_close_minutes_after)} after it ends (Heads and Admins, any time). A resolved issue is deleted ${s.issue_retention_days} ${s.issue_retention_days === 1 ? 'day' : 'days'} after a Head marks it; not resolved and persistent ones stay until they are resolved. Finished services stay listed for ${s.issue_retention_days} ${s.issue_retention_days === 1 ? 'day' : 'days'}.`
  }
}
