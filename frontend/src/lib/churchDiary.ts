import { upcomingCelebrations, type Person } from './celebrations'
import { shiftIsoDays } from './rotaWindow'

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
}: {
  people: Person[]
  services: DiaryService[]
  events: DiaryEvent[]
  today: string
  windowDays?: number
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
    if (event.event_date < today || event.event_date > horizon) continue
    const time = diaryTime(event.start_time)
    entries.push({
      id: `event:${event.id}`,
      kind: 'event',
      date: event.event_date,
      title: event.title,
      detail: [time, event.location, event.department?.name].filter(Boolean).join(' · ') || null,
      // Whose idea it was, said quietly. An event with no name on it invites
      // "who put this here?" every time somebody sees it.
      addedBy: event.creator
        ? `${event.creator.first_name} ${event.creator.last_name}`.trim()
        : null,
      color: event.department?.color ?? null,
    })
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
