/*
 * When a repeating event happens (0234).
 *
 * Each occurrence is its own row, so this works out the dates once, when
 * the event is added: from the first date, by the rule, up to and
 * including the last date chosen, never more than MAX_OCCURRENCES of them.
 * A run of days (a three-day camp) keeps its length on every repeat.
 */

export type RepeatRule = 'weekly' | 'fortnightly' | 'monthly_date' | 'monthly_weekday' | 'yearly'

/** Enough for four years of weeks; nobody means more by "repeat". */
export const MAX_OCCURRENCES = 200

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINALS = ['first', 'second', 'third', 'fourth', 'last']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const format = (date: Date) => date.toISOString().slice(0, 10)
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

function plusDays(iso: string, n: number): string {
  const d = parse(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return format(d)
}

/** Which week of its month a date falls in: 0–3, or 4 for the last such weekday. */
function weekOfMonth(date: Date): number {
  const day = date.getUTCDate()
  const last = daysInMonth(date.getUTCFullYear(), date.getUTCMonth())
  if (day + 7 > last) return 4
  return Math.floor((day - 1) / 7)
}

/** The nth weekday of a month (4 = the last one). */
function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  if (nth === 4) {
    const last = new Date(Date.UTC(year, month, daysInMonth(year, month)))
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7))
    return last
  }
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (weekday - first.getUTCDay() + 7) % 7
  return new Date(Date.UTC(year, month, 1 + offset + nth * 7))
}

/** Every date the event starts on, first one included. */
export function occurrences(start: string, rule: RepeatRule, until: string): string[] {
  const out: string[] = []
  const first = parse(start)
  const day = first.getUTCDate()
  const weekday = first.getUTCDay()
  const nth = weekOfMonth(first)

  for (let i = 0; out.length < MAX_OCCURRENCES; i += 1) {
    let next: Date
    if (rule === 'weekly' || rule === 'fortnightly') {
      next = parse(plusDays(start, i * (rule === 'weekly' ? 7 : 14)))
    } else if (rule === 'yearly') {
      const year = first.getUTCFullYear() + i
      // 29 February falls back to the 28th in a year without one.
      next = new Date(Date.UTC(year, first.getUTCMonth(), Math.min(day, daysInMonth(year, first.getUTCMonth()))))
    } else {
      const months = first.getUTCMonth() + i
      const year = first.getUTCFullYear() + Math.floor(months / 12)
      const month = months % 12
      next =
        rule === 'monthly_date'
          ? // The 31st in a 30-day month is its last day, not skipped.
            new Date(Date.UTC(year, month, Math.min(day, daysInMonth(year, month))))
          : nthWeekday(year, month, weekday, nth)
    }
    const iso = format(next)
    if (iso > until) break
    out.push(iso)
  }
  return out
}

/** The choices, in words, for this first date. */
export function repeatChoices(start: string): { value: RepeatRule | ''; label: string }[] {
  const first = parse(start)
  const weekday = WEEKDAYS[first.getUTCDay()]
  const day = first.getUTCDate()
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return [
    { value: '', label: 'Does not repeat' },
    { value: 'weekly', label: `Every week on ${weekday}` },
    { value: 'fortnightly', label: `Every 2 weeks on ${weekday}` },
    { value: 'monthly_weekday', label: `Every month on the ${ORDINALS[weekOfMonth(first)]} ${weekday}` },
    { value: 'monthly_date', label: `Every month on the ${day}${suffix}` },
    { value: 'yearly', label: `Every year on ${day} ${MONTHS[first.getUTCMonth()]}` },
  ]
}

/** A sensible last date to offer, by how often it repeats. */
export function defaultUntil(start: string, rule: RepeatRule): string {
  const d = parse(start)
  if (rule === 'weekly' || rule === 'fortnightly') d.setUTCMonth(d.getUTCMonth() + 3)
  else if (rule === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 5)
  else d.setUTCFullYear(d.getUTCFullYear() + 1)
  return format(d)
}

/** "Repeats every week on Sunday" — for the event's own card. */
export function repeatWords(start: string, rule: string | null | undefined): string | null {
  if (!rule) return null
  const found = repeatChoices(start).find((c) => c.value === rule)
  return found ? `Repeats ${found.label.charAt(0).toLowerCase()}${found.label.slice(1)}` : null
}

/** The same length of run, moved to start on `date`. */
export function shiftRun(eventDate: string, endsOn: string | null, date: string): { event_date: string; ends_on: string | null } {
  if (!endsOn || endsOn <= eventDate) return { event_date: date, ends_on: null }
  const length = Math.round((parse(endsOn).getTime() - parse(eventDate).getTime()) / 86_400_000)
  return { event_date: date, ends_on: plusDays(date, length) }
}

/**
 * Whether a range picked for a repeating event is how long it repeats for
 * rather than how long each time lasts: as long as the gap between repeats
 * or longer. A weekly meeting "5 Oct to 2 Nov" repeats until 2 Nov; a
 * weekend camp every month (two days) lasts two days each time.
 */
export function rangeIsRepeatPeriod(from: string, to: string | null, rule: RepeatRule): boolean {
  if (!to || to <= from) return false
  const days = Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000)
  const gap = { weekly: 7, fortnightly: 14, monthly_date: 28, monthly_weekday: 28, yearly: 365 }[rule]
  return days >= gap
}
