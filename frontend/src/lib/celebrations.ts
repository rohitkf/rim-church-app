export type OccasionKind = 'birthday' | 'anniversary'

export interface Person {
  id: string
  first_name: string
  last_name: string
  dob?: string | null
  anniversary?: string | null
}

export interface Occasion {
  id: string
  personId: string
  name: string
  kind: OccasionKind
  /** The original date, as stored. */
  since: string
  /** The next time it comes round, as an ISO date. */
  nextIso: string
  /** 0 today, 1 tomorrow, and so on. */
  daysAway: number
  /** How many years it will be — null if the stored year looks unset. */
  years: number | null
}

const DAY_MS = 86_400_000

function utc(y: number, m: number, d: number) {
  return Date.UTC(y, m - 1, d)
}

function isLeap(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * When a date next comes round on or after `from`.
 *
 * 29 February falls back to the 28th in common years: marking it a day
 * early each time beats skipping three years in four.
 */
export function nextOccurrence(dateIso: string, fromIso: string): string | null {
  const [y, m, d] = dateIso.split('-').map(Number)
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  if (!y || !m || !d || !fy) return null

  const on = (year: number) => {
    const day = m === 2 && d === 29 && !isLeap(year) ? 28 : d
    return utc(year, m, day)
  }

  const from = utc(fy, fm, fd)
  const target = on(fy) >= from ? on(fy) : on(fy + 1)
  return new Date(target).toISOString().slice(0, 10)
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number)
  const [ty, tm, td] = toIso.split('-').map(Number)
  return Math.round((utc(ty, tm, td) - utc(fy, fm, fd)) / DAY_MS)
}

/**
 * Everyone's birthdays and anniversaries falling within the next
 * `windowDays`, soonest first.
 *
 * A date with no year set — some people fill in only the day and month, and
 * some systems store 1900 as a placeholder — still gets listed; it just
 * doesn't claim to know how many years it has been.
 */
export function upcomingCelebrations(
  people: Person[],
  todayIso: string,
  windowDays = 60,
): Occasion[] {
  const out: Occasion[] = []

  for (const person of people) {
    const entries: [OccasionKind, string | null | undefined][] = [
      ['birthday', person.dob],
      ['anniversary', person.anniversary],
    ]

    for (const [kind, value] of entries) {
      if (!value) continue
      const nextIso = nextOccurrence(value, todayIso)
      if (!nextIso) continue
      const daysAway = daysBetween(todayIso, nextIso)
      if (daysAway < 0 || daysAway > windowDays) continue

      const storedYear = Number(value.slice(0, 4))
      const nextYear = Number(nextIso.slice(0, 4))
      const years = storedYear > 1900 ? nextYear - storedYear : null

      out.push({
        id: `${person.id}:${kind}`,
        personId: person.id,
        name: `${person.first_name} ${person.last_name}`.trim(),
        kind,
        since: value,
        nextIso,
        daysAway,
        years,
      })
    }
  }

  return out.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name))
}

/** "Today", "Tomorrow", "In 6 days" — how far off it is, in words. */
export function whenLabel(daysAway: number): string {
  if (daysAway === 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  if (daysAway < 7) return `In ${daysAway} days`
  if (daysAway < 14) return 'Next week'
  return `In ${Math.round(daysAway / 7)} weeks`
}
