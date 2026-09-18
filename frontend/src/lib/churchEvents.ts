import { z } from 'zod'
import { supabase } from './supabaseClient'
import { dayCount, daysBetween } from './dateRange'
import { diaryTime, type DiaryEvent } from './churchDiary'

export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  details: z.string().nullable(),
  event_date: z.string(),
  ends_on: z.string().nullable(),
  start_time: z.string().nullable(),
  location: z.string().nullable(),
  department_id: z.string().nullable(),
  created_by: z.string().nullable(),
  creator: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
  department: z.object({ name: z.string(), color: z.string().nullable() }).nullable(),
})

/** Every event the viewer may see, earliest first. RLS does the narrowing. */
export async function fetchEvents(): Promise<DiaryEvent[]> {
  const { data, error } = await supabase
    .from('church_events')
    .select(
      'id, title, details, event_date, ends_on, start_time, location, department_id, created_by, creator:profiles!church_events_created_by_fkey(first_name, last_name), department:departments(name, color)',
    )
    .order('event_date')
  if (error) throw error
  return z.array(eventSchema).parse(data)
}

/** An event as the day's banner says it. */
export interface EventToday {
  id: string
  title: string
  /** "7:00pm", or null when nobody gave it an hour. */
  time: string | null
  location: string | null
  /** The team it belongs to, and their colour, when it belongs to one. */
  team: string | null
  color: string | null
  details: string | null
  /** Which day of a run this is — null for the single-day majority. */
  day: { of: number; nth: number } | null
}

/**
 * What is on today.
 *
 * A run of days is one row in the table and one thing happening on each of
 * the days it covers, so a week of prayer is on today from Monday to
 * Sunday — and says which day of itself it is, because "Week of Prayer"
 * seven mornings running is otherwise indistinguishable from a mistake.
 *
 * Timed things lead, in clock order; whatever has no hour follows, since a
 * day with no time on it cannot be put in a queue with things that have.
 */
export function eventsOnDay(events: DiaryEvent[], today: string): EventToday[] {
  return events
    .filter((event) => {
      const lastDay = event.ends_on && event.ends_on > event.event_date ? event.ends_on : event.event_date
      return event.event_date <= today && today <= lastDay
    })
    .map((event) => {
      const runsTo = event.ends_on && event.ends_on > event.event_date ? event.ends_on : null
      // Ordered on "09:00:00" rather than on "9:00am", which sorts as text
      // into an order no clock has ever run in.
      const at = runsTo && today !== event.event_date ? null : event.start_time
      return {
        at,
        id: event.id,
        title: event.title,
        // The hour belongs to the first day of a run. "7pm" on day three of
        // a conference is a time nobody ever said.
        time: diaryTime(at),
        location: event.location,
        team: event.department?.name ?? null,
        color: event.department?.color ?? null,
        details: event.details,
        day: runsTo
          ? { of: dayCount(event.event_date, runsTo), nth: daysBetween(event.event_date, today).length }
          : null,
      }
    })
    .sort(
      (a, b) =>
        Number(a.at === null) - Number(b.at === null) ||
        (a.at ?? '').localeCompare(b.at ?? '') ||
        a.title.localeCompare(b.title),
    )
    .map(({ at: _at, ...event }) => event)
}
