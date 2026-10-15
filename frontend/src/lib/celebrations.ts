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
  /**
   * A couple's anniversary: both of them, by name, in one entry. Absent
   * for everything that belongs to one person.
   */
  couple?: { ids: [string, string]; names: [string, string] }
}

/** Two accounts married to each other (the adults of one home, 0152). */
export type Couple = { a: string; b: string }

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
  couples: Couple[] = [],
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

  return pairAnniversaries(out, couples, people).sort(
    (a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name),
  )
}

/**
 * A husband and wife share one anniversary, so it is one entry with both
 * names rather than the same day listed twice.
 *
 * Paired when both carry the same date, or when only one of them filled it
 * in — the other's is the same day whether or not they typed it. Two
 * different dates are left as two entries: one of them is wrong, and
 * picking which would be a guess.
 */
function pairAnniversaries(occasions: Occasion[], couples: Couple[], people: Person[]): Occasion[] {
  if (couples.length === 0) return occasions
  const nameById = new Map(people.map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]))
  const anniversaryOf = new Map<string, Occasion>()
  for (const o of occasions) if (o.kind === 'anniversary') anniversaryOf.set(o.personId, o)

  const taken = new Set<Occasion>()
  const pairs: Occasion[] = []
  for (const { a, b } of couples) {
    const nameA = nameById.get(a)
    const nameB = nameById.get(b)
    if (!nameA || !nameB) continue
    const ofA = anniversaryOf.get(a)
    const ofB = anniversaryOf.get(b)
    const one = ofA ?? ofB
    if (!one || (ofA && taken.has(ofA)) || (ofB && taken.has(ofB))) continue
    if (ofA && ofB && ofA.nextIso !== ofB.nextIso) continue

    const [x, y] = [
      { id: a, name: nameA },
      { id: b, name: nameB },
    ].sort((p, q) => p.name.localeCompare(q.name))
    pairs.push({
      ...one,
      id: `couple:${x.id}:${y.id}:anniversary`,
      name: `${x.name} & ${y.name}`,
      years: ofA?.years ?? ofB?.years ?? null,
      couple: { ids: [x.id, y.id], names: [x.name, y.name] },
    })
    if (ofA) taken.add(ofA)
    if (ofB) taken.add(ofB)
  }
  return [...occasions.filter((o) => !taken.has(o)), ...pairs]
}

/** "Today", "Tomorrow", "In 6 days" — how far off it is, in words. */
export function whenLabel(daysAway: number): string {
  if (daysAway === 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  if (daysAway < 7) return `In ${daysAway} days`
  if (daysAway < 14) return 'Next week'
  return `In ${Math.round(daysAway / 7)} weeks`
}

/**
 * Whole years between a date of birth and today.
 *
 * Counted from the calendar rather than from milliseconds: a birthday that
 * has not come round yet this year has not happened, whatever the arithmetic
 * on the elapsed days says. Returns null when the stored year is a
 * placeholder — some profiles carry a birthday with no year, and "56" from
 * 1970 is worse than saying nothing.
 */
export function ageFrom(dob: string | null | undefined, today: Date = new Date()): number | null {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  if (!y || !m || !d || y < 1900) return null
  let age = today.getFullYear() - y
  const monthNow = today.getMonth() + 1
  if (monthNow < m || (monthNow === m && today.getDate() < d)) age -= 1
  return age >= 0 && age < 130 ? age : null
}
