import type { AvailabilityStatus } from './types'

export interface Turnout {
  /** People who said they'd be there — the expected count. */
  expected: number
  /** Of those, confirmed present by the team head. */
  actual: number
  /** Confirmed absent. */
  noShow: number
  /** Expected but not yet confirmed either way. */
  unconfirmed: number
  /** actual / expected as a percentage, or null before anyone says yes. */
  pct: number | null
}

/**
 * Turnout for one team at one service, read off the availability answers.
 * Only people who said "available" count as expected: a tentative reply
 * isn't a commitment, so counting it would flatter the estimate.
 */
export function turnoutFrom(
  answers: { status: AvailabilityStatus; attended: boolean | null }[],
): Turnout {
  const committed = answers.filter((a) => a.status === 'available')
  const actual = committed.filter((a) => a.attended === true).length
  const noShow = committed.filter((a) => a.attended === false).length

  return {
    expected: committed.length,
    actual,
    noShow,
    unconfirmed: committed.length - actual - noShow,
    pct: committed.length > 0 ? Math.round((actual / committed.length) * 100) : null,
  }
}

/** Adds up several teams' turnout into one figure for a whole service. */
export function combineTurnout(parts: Turnout[]): Turnout {
  const expected = parts.reduce((n, p) => n + p.expected, 0)
  const actual = parts.reduce((n, p) => n + p.actual, 0)
  const noShow = parts.reduce((n, p) => n + p.noShow, 0)
  return {
    expected,
    actual,
    noShow,
    unconfirmed: expected - actual - noShow,
    pct: expected > 0 ? Math.round((actual / expected) * 100) : null,
  }
}
