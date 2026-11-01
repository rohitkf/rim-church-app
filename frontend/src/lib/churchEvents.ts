import { z } from 'zod'
import { supabase } from './supabaseClient'
import { addDays, dayCount, daysBetween } from './dateRange'
import {
  DIARY_WINDOW_DAYS,
  diaryTime,
  diaryTimes,
  eventIsOver,
  lastDayOf,
  repeatShort,
  teamsOf,
  type DiaryEntry,
  type DiaryEvent,
} from './churchDiary'

export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  details: z.string().nullable(),
  event_date: z.string(),
  ends_on: z.string().nullable(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable().optional(),
  location: z.string().nullable(),
  department_id: z.string().nullable(),
  department_ids: z.array(z.string()).nullable().optional(),
  created_by: z.string().nullable(),
  series_id: z.string().nullable().optional(),
  repeat_rule: z.string().nullable().optional(),
  creator: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
  department: z.object({ name: z.string(), color: z.string().nullable() }).nullable(),
})

const teamSchema = z.object({ id: z.string(), name: z.string(), color: z.string().nullable() })

/**
 * Every event the viewer may see, earliest first. RLS does the narrowing.
 *
 * An event can be for several teams (0237): a list of ids, which no join
 * can follow, so the teams are read alongside and put to them here.
 */
export async function fetchEvents(): Promise<DiaryEvent[]> {
  const [events, teams] = await Promise.all([
    supabase
      .from('church_events')
      .select(
        'id, title, details, event_date, ends_on, start_time, end_time, location, department_id, department_ids, created_by, series_id, repeat_rule, creator:profiles!church_events_created_by_fkey(first_name, last_name), department:departments(name, color)',
      )
      .order('event_date'),
    supabase.from('departments').select('id, name, color'),
  ])
  if (events.error) throw events.error
  if (teams.error) throw teams.error
  const byId = new Map(z.array(teamSchema).parse(teams.data ?? []).map((t) => [t.id, t]))
  return z
    .array(eventSchema)
    .parse(events.data)
    .map((event) => {
      const ids = event.department_ids?.length ? event.department_ids : event.department_id ? [event.department_id] : []
      return {
        ...event,
        department_ids: ids,
        teams: ids.flatMap((id) => {
          const t = byId.get(id)
          return t ? [{ name: t.name, color: t.color }] : []
        }),
      }
    })
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
    .filter((event) => event.event_date <= today && today <= lastDayOf(event))
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
        time: runsTo ? diaryTime(at) : diaryTimes(at, event.end_time),
        location: event.location,
        team: teamsOf(event),
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

/**
 * The events that are over, most recent first.
 *
 * One row apiece, whatever they ran for: a week of prayer is seven answers
 * to "what is on today" while it is on, and one thing that happened once
 * it is not. The range says the rest.
 *
 * Kept rather than dropped because this page is the only place an event is
 * ever written down. Everything else in the diary survives its own date —
 * a birthday comes round again, a service has the planner and the finished
 * list — so the morning after a members' meeting it was the one kind that
 * simply stopped existing.
 */
export function pastDiaryEntries(
  events: DiaryEvent[],
  today: string,
  keepDays: number = DIARY_WINDOW_DAYS,
): DiaryEntry[] {
  // The last year unless the church says otherwise (Settings › Dashboard
  // & lists): a record of what it has done lately, not everything it ever did.
  const floor = addDays(today, -keepDays)
  return events
    .filter((event) => eventIsOver(event, today) && lastDayOf(event) >= floor)
    .map((event) => {
      const runsTo = event.ends_on && event.ends_on > event.event_date ? event.ends_on : null
      return {
        // No day on the end: a past event is one entry, so the id is the
        // row's own. `event:<id>` is what the page splits to find it.
        id: `event:${event.id}`,
        kind: 'event' as const,
        date: event.event_date,
        title: event.title,
        detail:
          [diaryTimes(event.start_time, event.end_time), event.location, teamsOf(event)]
            .filter(Boolean)
            .join(' · ') || null,
        addedBy: event.creator
          ? `${event.creator.first_name} ${event.creator.last_name}`.trim()
          : null,
        color: event.department?.color ?? null,
        // The whole run, and no "day 3 of 7" — there is no day of it to be
        // on any more.
        span: runsTo ? { from: event.event_date, to: runsTo, day: 0, of: dayCount(event.event_date, runsTo) } : null,
        repeats: repeatShort(event.repeat_rule),
      }
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        (a.detail ?? '').localeCompare(b.detail ?? '') ||
        a.title.localeCompare(b.title),
    )
}
