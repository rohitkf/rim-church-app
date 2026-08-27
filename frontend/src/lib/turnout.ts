import type { AvailabilityStatus } from './types'

export interface Turnout {
  /** The people the team counts on: its core roster. */
  expected: number
  /** Of them, confirmed present on the day. */
  present: number
  /** Said they would be there and were not. */
  noShow: number
  /** Said they would be there; nobody has confirmed either way yet. */
  unconfirmed: number
  /** Said they would be there — the estimate attendance is judged against. */
  committed: number
  /** present / expected as a percentage, or null while nothing is recorded. */
  pct: number | null
  /** Of those who committed, the share who turned up — how good the estimate was. */
  keptPct: number | null
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

/**
 * Turnout for one team at one service.
 *
 * The denominator is the team's core roster — the same one the availability
 * estimate is measured against — because the two sit side by side and are
 * meant to answer the same question: how much of this team is here. Counting
 * only the people who said yes would let the goalpost move with the answers,
 * so a team where one of four said yes and turned up would read as 100%
 * attendance, and a team where nobody said yes would vanish from the total
 * rather than showing up as the gap it is.
 *
 * `keptPct` keeps the other, narrower question — of those who committed, how
 * many actually came — because that is what tells a head whether the
 * estimate can be trusted next week.
 */
export function turnoutFrom(
  memberIds: string[],
  answers: { user_id: string; status: AvailabilityStatus; attended: boolean | null }[],
): Turnout {
  const roster = new Set(memberIds)
  // Guests and people who have left the team answer too, but they are not
  // who the team is counted against — the estimate ignores them, so this
  // must as well, or the two panels describe different groups of people.
  const onRoster = answers.filter((a) => roster.has(a.user_id))
  const committed = onRoster.filter((a) => a.status === 'available')
  const present = committed.filter((a) => a.attended === true).length
  const noShow = committed.filter((a) => a.attended === false).length

  return {
    expected: roster.size,
    present,
    noShow,
    unconfirmed: committed.length - present - noShow,
    committed: committed.length,
    // Nothing recorded yet is not the same as nobody turning up, so the
    // percentage stays absent until someone has been marked either way.
    pct: present + noShow > 0 ? percent(present, roster.size) : null,
    keptPct: present + noShow > 0 ? percent(present, committed.length) : null,
  }
}

/** Adds up several teams' turnout into one figure for a whole service. */
export function combineTurnout(parts: Turnout[]): Turnout {
  const sum = (pick: (p: Turnout) => number) => parts.reduce((n, p) => n + pick(p), 0)
  const expected = sum((p) => p.expected)
  const present = sum((p) => p.present)
  const noShow = sum((p) => p.noShow)
  const committed = sum((p) => p.committed)
  const recorded = present + noShow > 0

  return {
    expected,
    present,
    noShow,
    unconfirmed: committed - present - noShow,
    committed,
    pct: recorded ? percent(present, expected) : null,
    keptPct: recorded ? percent(present, committed) : null,
  }
}
