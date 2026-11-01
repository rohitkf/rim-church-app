import { upcomingCelebrations, type Couple, type Person } from './celebrations'
import { shiftIsoDays } from './rotaWindow'
import { dayCount, daysBetween } from './dateRange'

/**
 * One diary out of four separate things.
 *
 * A birthday lives on a profile, an anniversary beside it, a service on the
 * planner, and a members' meeting nowhere at all until now. Somebody asking
 * "what is on in March" does not care which table the answer came from, so
 * this flattens all four into dated entries the page can just draw.
 *
 * Recurring dates are resolved to their next occurrence before they get here,
 * which is why a birthday in 1990 turns up under this year's date.
 */
export type DiaryKind = 'birthday' | 'anniversary' | 'service' | 'event'

export interface DiaryEntry {
  id: string
  kind: DiaryKind
  /** The day it falls on, as an ISO date. */
  date: string
  title: string
  /** The quiet second line: a time, a team, a location, who added it. */
  detail?: string | null
  /** Who put it in the diary, for the kinds where a person chose. */
  addedBy?: string | null
  /** Where clicking it should go, when there is somewhere to go. */
  href?: string | null
  /** The team's colour, when it belongs to one. */
  color?: string | null
  /**
   * For something that runs over several days: the whole span, carried on
   * each day it covers.
   *
   * A week of prayer is one event and seven answers to "what is on today",
   * so it is drawn on every one of those days — and each of them has to be
   * able to say which day of it this is, or the diary reads as seven
   * identical events somebody entered by mistake.
   */
  span?: { from: string; to: string; day: number; of: number } | null
  /** How it repeats, when it is one of a series (0234): "every week", shown as a Repeats chip. */
  repeats?: string | null
  /** A couple's anniversary: the two of them, drawn one under the title. */
  couple?: [string, string] | null
}

/**
 * The last day an event covers, which for the single-day majority is the
 * only day it has. `ends_on` before the start is nonsense somebody typed;
 * it is read as no run rather than as a negative one.
 */
export function lastDayOf(event: DiaryEvent): string {
  return event.ends_on && event.ends_on > event.event_date ? event.ends_on : event.event_date
}

/** Whether an event is over: every day of it behind us. */
export function eventIsOver(event: DiaryEvent, today: string): boolean {
  return lastDayOf(event) < today
}

export interface DiaryService {
  id: string
  date: string
  service_type: string
}

export interface DiaryEvent {
  id: string
  title: string
  event_date: string
  /** Last day of a run, inclusive. Null for the single-day majority. */
  ends_on?: string | null
  start_time: string | null
  /** When it finishes (0236), on its last day; null when nobody said. */
  end_time?: string | null
  location: string | null
  details: string | null
  department_id: string | null
  created_by: string | null
  /** The repeats it belongs to, and how they repeat (0234); null for a one-off. */
  series_id?: string | null
  repeat_rule?: string | null
  creator?: { first_name: string; last_name: string } | null
  department?: { name: string; color: string | null } | null
  /** Every team it is for (0237), first first; none is all teams. */
  department_ids?: string[]
  /** Those teams' names and colours, in the same order. */
  teams?: { name: string; color: string | null }[]
  /** It is for every team there is: said as "All teams", not as eight names. */
  allTeams?: boolean
}

/** "Worship, Media", or "All teams" — the teams an event is for; null when it is the whole church's. */
export function teamsOf(event: Pick<DiaryEvent, 'department' | 'teams' | 'allTeams'>): string | null {
  if (event.allTeams) return 'All teams'
  if (event.teams && event.teams.length > 0) return event.teams.map((t) => t.name).join(', ')
  return event.department?.name ?? null
}

/** "14:30:00" as it should read in a diary. Blank stays blank. */
export function diaryTime(value: string | null | undefined): string | null {
  if (!value) return null
  const [h, m] = value.split(':')
  const hour = Number(h)
  if (Number.isNaN(hour)) return null
  const suffix = hour < 12 ? 'am' : 'pm'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}:${m ?? '00'}${suffix}`
}

/**
 * "7:00pm – 8:30pm", "7:00pm", or "until 8:30pm" — an event's hours as a
 * diary says them (0236). Either may be missing; both missing is nothing.
 */
export function diaryTimes(start: string | null | undefined, end: string | null | undefined): string | null {
  const from = diaryTime(start)
  const to = diaryTime(end)
  if (from && to) return `${from} – ${to}`
  if (from) return from
  if (to) return `until ${to}`
  return null
}

/**
 * How far ahead the diary looks: one year, to the day.
 *
 * A diary is for what is coming, and a year is the longest anyone plans a
 * church around — beyond it the list is birthdays repeating themselves and
 * a service somebody pencilled in for a date they will change. Everything
 * in it, of every kind, stops at the same horizon rather than each kind
 * running to a different one.
 */
export const DIARY_WINDOW_DAYS = 365

export function buildDiary({
  people,
  couples = [],
  services,
  events,
  today,
  windowDays = DIARY_WINDOW_DAYS,
  includePast = false,
}: {
  people: Person[]
  /** Who is married to whom, so a couple's anniversary is one entry. */
  couples?: Couple[]
  services: DiaryService[]
  events: DiaryEvent[]
  today: string
  windowDays?: number
  /**
   * Whether events that are over come too — the last year of them, the
   * same distance back as the diary looks ahead.
   *
   * A diary is for what is coming, so by default what has happened drops
   * out of it. But an event is the one kind here that happened once and
   * leaves no other record — the page that lists them was also the only
   * place they had ever been written down, so a members' meeting stopped
   * existing the morning after it. Birthdays recur and services have the
   * planner; only events needed keeping.
   */
  includePast?: boolean
}): DiaryEntry[] {
  const entries: DiaryEntry[] = []
  const horizon = shiftIsoDays(today, windowDays)
  const pastFloor = shiftIsoDays(today, -windowDays)

  for (const occasion of upcomingCelebrations(people, today, windowDays, couples)) {
    entries.push({
      id: occasion.id,
      kind: occasion.kind,
      date: occasion.nextIso,
      title: occasion.name,
      couple: occasion.couple?.names ?? null,
      detail:
        occasion.years === null
          ? occasion.kind === 'birthday'
            ? 'Birthday'
            : 'Anniversary'
          : occasion.kind === 'birthday'
            ? `Turns ${occasion.years}`
            : `${occasion.years} ${occasion.years === 1 ? 'year' : 'years'}`,
    })
  }

  for (const service of services) {
    if (service.date < today || service.date > horizon) continue
    entries.push({
      id: `service:${service.id}`,
      kind: 'service',
      date: service.date,
      title: service.service_type,
      // The chip beside the name already says "Service"; saying it twice on
      // one line is how a list starts to look like filler.
      detail: null,
      href: `/service-planner/${service.id}`,
    })
  }

  for (const event of events) {
    const runsTo = event.ends_on && event.ends_on > event.event_date ? event.ends_on : null
    // A run is in the diary if any part of it is: one that started
    // yesterday and ends tomorrow is very much on today.
    if (event.event_date > horizon) continue
    if (!includePast && eventIsOver(event, today)) continue
    // A year back and no further: the diary is for this year's church,
    // and a list that grew for ever would bury last month under 2019.
    if (includePast && lastDayOf(event) < pastFloor) continue

    // One day: its whole hours. A run: the start on its first day and the
    // end on its last, since those are the only times anybody said.
    const time = runsTo ? diaryTime(event.start_time) : diaryTimes(event.start_time, event.end_time)
    const lastTime = runsTo && event.end_time ? `until ${diaryTime(event.end_time)}` : null
    const of = runsTo ? dayCount(event.event_date, runsTo) : 1
    // Every day it covers that is inside the window somebody is looking at.
    const floor = includePast
      ? (event.event_date > pastFloor ? event.event_date : pastFloor)
      : today
    const days = runsTo
      ? daysBetween(event.event_date, runsTo).filter((d) => d >= floor && d <= horizon)
      : [event.event_date]

    for (const date of days) {
      entries.push({
        // One entry per day, so each needs an id of its own — the page
        // finds the row it came from by the id in the middle.
        id: runsTo ? `event:${event.id}:${date}` : `event:${event.id}`,
        kind: 'event',
        date,
        title: event.title,
        detail:
          [
            // A start time belongs to the first day of a run, not to every
            // day of it: "7pm" on days two and three is a time nobody said.
            runsTo ? (date === event.event_date ? time : date === runsTo ? lastTime : null) : time,
            event.location,
            teamsOf(event),
          ]
            .filter(Boolean)
            .join(' · ') || null,
        // Whose idea it was, said quietly. An event with no name on it invites
        // "who put this here?" every time somebody sees it.
        addedBy: event.creator
          ? `${event.creator.first_name} ${event.creator.last_name}`.trim()
          : null,
        color: event.department?.color ?? null,
        repeats: repeatShort(event.repeat_rule),
        span: runsTo
          ? {
              from: event.event_date,
              to: runsTo,
              // Which day of the run this is, counting from the start
              // rather than from the window — day 3 of 5 stays day 3 even
              // when the first two have already passed.
              day: daysBetween(event.event_date, date).length,
              of,
            }
          : null,
      })
    }
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
}

/** The diary grouped by day, in date order, for a list that says the date once. */
export function byDay(entries: DiaryEntry[]): [string, DiaryEntry[]][] {
  const days = new Map<string, DiaryEntry[]>()
  for (const entry of entries) {
    days.set(entry.date, [...(days.get(entry.date) ?? []), entry])
  }
  return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export const KIND_LABEL: Record<DiaryKind, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  service: 'Service',
  event: 'Event',
}

/** "every week", "every month" — the Repeats chip's words for a rule (0234). */
export function repeatShort(rule: string | null | undefined): string | null {
  switch (rule) {
    case 'weekly':
      return 'every week'
    case 'fortnightly':
      return 'every 2 weeks'
    case 'monthly_date':
    case 'monthly_weekday':
      return 'every month'
    case 'yearly':
      return 'every year'
    default:
      return null
  }
}
