import { z } from 'zod'
import { supabase } from './supabaseClient'
import { addDays } from './dateRange'

/**
 * How often a service comes round, as the new-service form offers it.
 *
 * The rule itself lives in the database (`series_date`, 0105), because the
 * nightly job that keeps eight weeks filled is what actually makes the
 * services. This file only has to *say* the rule — label the choices and
 * show the next few dates before anybody commits to them — so it mirrors
 * the same arithmetic, and its tests pin the same dates the migration was
 * checked against.
 */
export type RepeatChoice = 'none' | 'weekly' | 'fortnightly' | 'monthly_weekday' | 'monthly_date'
export type Frequency = Exclude<RepeatChoice, 'none'>

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const NTH = ['first', 'second', 'third', 'fourth']

/** Midday, so a day's arithmetic never crosses a DST boundary. */
function at(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12)
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** Which week of its month a date is in, 1–5. A 5 is read as "the last". */
function weekOfMonth(date: string): number {
  return Math.ceil(at(date).getDate() / 7)
}

/** "first Sunday", "last Sunday" — the weekday a monthly repeat keeps. */
export function monthlyWeekdayPhrase(date: string): string {
  const nth = weekOfMonth(date)
  const day = WEEKDAYS[at(date).getDay()]
  return `${nth >= 5 ? 'last' : NTH[nth - 1]} ${day}`
}

/**
 * The choices, worded for the date somebody picked.
 *
 * "Every week on Sunday" rather than "Weekly": the day is the part people
 * check, and a date picked on a Saturday by mistake shows up here before
 * it becomes eight Saturdays.
 */
export function repeatOptions(date: string): { value: RepeatChoice; label: string }[] {
  if (!date) {
    return [
      { value: 'none', label: 'Doesn’t repeat' },
      { value: 'weekly', label: 'Every week' },
      { value: 'fortnightly', label: 'Every two weeks' },
      { value: 'monthly_weekday', label: 'Monthly, on the same weekday' },
      { value: 'monthly_date', label: 'Monthly, on the same date' },
    ]
  }
  const day = WEEKDAYS[at(date).getDay()]
  return [
    { value: 'none', label: 'Doesn’t repeat' },
    { value: 'weekly', label: `Every week on ${day}` },
    { value: 'fortnightly', label: `Every two weeks on ${day}` },
    { value: 'monthly_weekday', label: `Monthly on the ${monthlyWeekdayPhrase(date)}` },
    { value: 'monthly_date', label: `Monthly on the ${ordinal(at(date).getDate())}` },
  ]
}

/**
 * The nth date a repeat lands on, counting the first as 0 — the same rule
 * as the database's `series_date`.
 *
 * A monthly date past the end of a shorter month becomes its last day (the
 * 31st is the 30th in April), and a 5th weekday is read as the last one,
 * because most months have no fifth Sunday.
 */
export function repeatDate(anchor: string, frequency: Frequency, n: number): string {
  if (frequency === 'weekly') return addDays(anchor, 7 * n)
  if (frequency === 'fortnightly') return addDays(anchor, 14 * n)

  const a = at(anchor)
  const monthStart = new Date(a.getFullYear(), a.getMonth() + n, 1, 12)
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 12)

  if (frequency === 'monthly_date') {
    return iso(new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(a.getDate(), monthEnd.getDate()), 12))
  }

  const dow = a.getDay()
  const nth = weekOfMonth(anchor)
  if (nth >= 5) {
    const back = (monthEnd.getDay() - dow + 7) % 7
    return iso(new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() - back, 12))
  }
  const first = 1 + ((dow - monthStart.getDay() + 7) % 7)
  return iso(new Date(monthStart.getFullYear(), monthStart.getMonth(), first + 7 * (nth - 1), 12))
}

/** The first few dates, for the form to show before anything is made. */
export function upcomingRepeats(anchor: string, frequency: Frequency, count = 4): string[] {
  return Array.from({ length: count }, (_, n) => repeatDate(anchor, frequency, n))
}

/** What a repeating service's page says about where it came from. */
export function repeatSummary(frequency: Frequency, anchor: string): string {
  switch (frequency) {
    case 'weekly':
      return `Repeats every week on ${WEEKDAYS[at(anchor).getDay()]}`
    case 'fortnightly':
      return `Repeats every two weeks on ${WEEKDAYS[at(anchor).getDay()]}`
    case 'monthly_weekday':
      return `Repeats monthly on the ${monthlyWeekdayPhrase(anchor)}`
    case 'monthly_date':
      return `Repeats monthly on the ${ordinal(at(anchor).getDate())}`
  }
}

export const serviceSeriesSchema = z.object({
  id: z.string(),
  service_type: z.string(),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly_weekday', 'monthly_date']),
  anchor_date: z.string(),
  stopped_at: z.string().nullable(),
})
export type ServiceSeries = z.infer<typeof serviceSeriesSchema>

export async function fetchServiceSeries(id: string): Promise<ServiceSeries | null> {
  const { data, error } = await supabase
    .from('service_series')
    .select('id, service_type, frequency, anchor_date, stopped_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data ? serviceSeriesSchema.parse(data) : null
}

/**
 * Start a repeat. The database makes the first eight weeks at once and
 * hands back the first service, so the page can open it.
 */
export async function createServiceSeries(input: {
  date: string
  serviceType: string
  frequency: Frequency
  templateId: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_service_series', {
    first_date: input.date,
    service_name: input.serviceType,
    how_often: input.frequency,
    template: input.templateId,
  })
  if (error) throw error
  return z.string().parse(data)
}

/** Stop making new ones. Everything already made stays exactly as it is. */
export async function stopServiceSeries(id: string): Promise<void> {
  const { error } = await supabase
    .from('service_series')
    .update({ stopped_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
