import { upcomingCelebrations, type Person } from './celebrations'
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
  location: string | null
  details: string | null
  department_id: string | null
  created_by: string | null
  creator?: { first_name: string; last_name: string } | null
  department?: { name: string; color: string | null } | null
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
  services,
  events,
  today,
  windowDays = DIARY_WINDOW_DAYS,
  includePast = false,
}: {
  people: Person[]
  services: DiaryService[]
  events: DiaryEvent[]
  today: string
  windowDays?: number
  /**
   * Whether events that are over come too.
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

  for (const occasion of upcomingCelebrations(people, today, windowDays)) {
    entries.push({
      id: occasion.id,
      kind: occasion.kind,
      date: occasion.nextIso,
      title: occasion.name,
      detail:
        occasion.years === null
          ? occasion.kind === 'birthday'
            ? 'Birthday'
            : 'Anniversary'
          : occasion.kind === 'birthday'
            ? `Turns ${occasion.years}`
            : `${occasion.years} years`,
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

    const time = diaryTime(event.start_time)
    const of = runsTo ? dayCount(event.event_date, runsTo) : 1
    // Every day it covers that is inside the window somebody is looking at.
    const floor = includePast ? event.event_date : today
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
            runsTo && date !== event.event_date ? null : time,
            event.location,
            event.department?.name,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        // Whose idea it was, said quietly. An event with no name on it invites
        // "who put this here?" every time somebody sees it.
        addedBy: event.creator
          ? `${event.creator.first_name} ${event.creator.last_name}`.trim()
          : null,
        color: event.department?.color ?? null,
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
