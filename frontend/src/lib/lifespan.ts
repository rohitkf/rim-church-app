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
  | 'feedback_retention_days'
  | 'service_retention_days'
  | 'notification_keep_count'
  | 'alert_clear_dow'
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
  debrief_retention_days: 14,
  issue_retention_days: 14,
  issue_open_minutes_before: 60,
  issue_close_minutes_after: 120,
  debrief_open_minutes_after: 720,
  edit_grace_minutes: 60,
  after_service_checklist_minutes: 120,
  availability_closes_time: '23:59:00',
  team_chat_retention_days: 30,
  church_update_retention_days: 30,
  poll_retention_days: 7,
  feedback_retention_days: 14,
  service_retention_days: 14,
  notification_keep_count: 10,
  alert_clear_dow: 2,
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
  | 'feedback'
  | 'notifications'
  | 'alerts'

export function lifespanOf(page: LifespanPage, given: Partial<Settings>, now = new Date()): string {
  const s: Settings = { ...FALLBACK }
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  const span = (n: number) => (n % 7 === 0 ? `${n / 7} ${n === 7 ? 'week' : 'weeks'}` : days(n))
  for (const key of Object.keys(FALLBACK) as (keyof Settings)[]) {
    if (given[key] !== undefined && given[key] !== null) (s as Record<string, unknown>)[key] = given[key]
  }
  // For these, null is a choice ("never", "for ever"), not a gap to fill.
  for (const key of ['alert_clear_dow', 'team_chat_retention_days', 'feedback_retention_days'] as const) {
    if (given[key] === null) (s as Record<string, unknown>)[key] = null
  }
  // A service takes its debrief, issues, rota and the rest with it, so no
  // clock tied to a service can outlast the service.
  const kept = s.service_retention_days
  const afterService = `deleted with its service ${span(kept)} after the service date`
  const clearDay = WEEKDAYS[s.board_clear_dow]
  const grace = formatMinutes(s.edit_grace_minutes)
  switch (page) {
    case 'messages':
      return `Every post is deleted each ${boardClearsAt(s, now)}, along with its notifications.`
    case 'activity':
      return `The activity feed clears each ${clearDay}, with the message board.`
    case 'debriefs':
      return `A team can write its debrief for ${formatMinutes(s.debrief_open_minutes_after)} after the service ends (Heads and Admins, any time). Minutes are deleted ${span(Math.min(s.debrief_retention_days, kept))} after their service.`
    case 'checklists':
      return `“Before the service” closes when the service ends; “After the service” stays open ${formatMinutes(s.after_service_checklist_minutes)} longer. Ticks are ${afterService}.`
    case 'availability':
      return `Answers close at ${s.availability_closes_time.slice(0, 5)} the night before each service, and are ${afterService}.`
    case 'rota':
      return `A service’s rota locks ${grace} after it ends, and is ${afterService}.`
    case 'planner':
      return `Finished services leave this list each ${clearDay}. A running order locks ${grace} after its service ends. Every service — running order, rota, availability, debrief, issues and all — is deleted ${span(kept)} after its date.`
    case 'set-lists':
      return `Shows ${span(s.set_list_days)} either side of today. A set list locks when its service finishes, and is ${afterService}.`
    case 'polls':
      return `Answers lock at a poll’s deadline, if it has one. Every poll is deleted at its own clear time — ${span(s.poll_retention_days)} after its deadline unless whoever asked chose otherwise.`
    case 'updates':
      return `Every update ends at its own time and is deleted then, pinned or not. A new one ends ${span(s.church_update_retention_days)} after it is posted unless the Admin picks another time.`
    case 'team-chat':
      return s.team_chat_retention_days === null
        ? 'Nothing here clears on its own — messages stay until they are deleted.'
        : `Messages are deleted ${days(s.team_chat_retention_days)} after they are posted.`
    case 'feedback':
      return s.feedback_retention_days === null
        ? 'Feedback stays until it is taken back or an Admin clears it.'
        : `Feedback marked Done or Won’t do is deleted ${days(s.feedback_retention_days)} after it was settled; anything still open stays.`
    case 'issues':
      return `Issues can be raised from ${formatMinutes(s.issue_open_minutes_before)} before a service starts until ${formatMinutes(s.issue_close_minutes_after)} after it ends (Heads and Admins, any time). A resolved issue is deleted ${span(Math.min(s.issue_retention_days, kept))} after a Head marks it. Every issue, resolved or not, is ${afterService}; an Admin can delete one sooner.`
    case 'notifications':
      return `Your bell keeps your newest ${s.notification_keep_count}; older ones are deleted as new ones arrive.`
    case 'alerts':
      return s.alert_clear_dow === null
        ? 'The record of sent alerts is kept until it is cleared by hand.'
        : `The record of sent alerts clears every ${WEEKDAYS[s.alert_clear_dow]} at 00:00 UTC.`
  }
}
