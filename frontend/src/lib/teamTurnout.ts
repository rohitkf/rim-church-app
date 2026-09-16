/**
 * What a team's ring says, before the day and on it.
 *
 * A team is two questions a week apart: how much of it is coming, and how
 * much of it is here. They are more useful together than in sequence — the
 * gap between them is the thing worth knowing — so the row carries both at
 * once rather than swapping one for the other when the register opens.
 *
 * Both are measured against the whole team, so they can be read against
 * each other: 70% expected, 50% turned up, and the difference is the
 * story. Counting turnout only against the people who promised would let
 * the goalpost move with the answers.
 *
 * The colour answers the narrower question neither number can. A team
 * where seven of ten said yes and all seven came is at 70% of its roster
 * and has done everything it said it would, so it is green; the missing
 * three are an availability problem, already visible in the expected
 * figure, not a turnout one.
 */
import type { AvailabilitySummary } from './availabilitySummary'
import type { Turnout } from './turnout'

export type TurnoutRingState =
  /** Nobody said they could serve. The worst case, and the loudest. */
  | 'none-available'
  /** People said yes; the register has not been started. */
  | 'predicted'
  /** The register is open and part-filled: both numbers are live. */
  | 'counting'
  /** Everyone who said yes has been marked one way or the other. */
  | 'settled'

export interface TurnoutRing {
  state: TurnoutRingState
  /** Share of the whole team who said they would come, 0–100. */
  predictedPct: number
  /** Share of the whole team confirmed present, or null before any mark. */
  actualPct: number | null
  /** The colour of the solid arc and of the turnout figure. */
  color: string
  /** Under the expected figure: the people behind it. */
  expectedSub: string
  /** The turnout figure, or a dash while there is nothing to report. */
  actualValue: string
  /** Under the turnout figure. */
  actualSub: string
  /** Nobody has answered yet — said once, under both. */
  toAnswer: number
}

const PENDING = 'var(--color-status-pending, var(--color-on-surface-faint))'
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export function turnoutRing(summary: AvailabilitySummary, turnout: Turnout): TurnoutRing {
  const predictedPct = share(summary.available, summary.total)
  const marked = turnout.present + turnout.noShow
  const actualPct = marked > 0 ? share(turnout.present, summary.total) : null

  const base = {
    predictedPct,
    actualPct,
    expectedSub: `${summary.available} of ${summary.total}`,
    toAnswer: summary.noAnswer,
  }

  // Nobody available is a real, actionable emptiness — not an absence of
  // data — so it reads as 0% rather than as a dash.
  if (turnout.committed === 0) {
    return {
      ...base,
      state: 'none-available',
      color: 'var(--color-accent-red)',
      actualValue: '—',
      actualSub: 'nobody due',
    }
  }

  // Said yes, but nobody has been marked. The turnout column is honest
  // about having nothing to say rather than reporting a confident 0%.
  if (marked === 0) {
    return { ...base, state: 'predicted', color: PENDING, actualValue: '—', actualSub: 'not yet' }
  }

  // The register is open and part-filled. The turnout figure is real but
  // still climbing, so it says so and stays grey: a team reading 20% at
  // nine in the morning because one of five is marked would be true in a
  // way that misleads.
  if (turnout.unconfirmed > 0) {
    return {
      ...base,
      state: 'counting',
      color: PENDING,
      actualValue: `${actualPct}%`,
      actualSub: `${turnout.present} of ${turnout.committed} so far`,
    }
  }

  // Everyone who said yes has been accounted for, so the figure is final
  // and the colour reports whether the team kept its word.
  const kept = share(turnout.present, turnout.committed)
  return {
    ...base,
    state: 'settled',
    color:
      kept === 100
        ? 'var(--color-accent-green)'
        : kept > 0
          ? 'var(--color-accent-orange)'
          : 'var(--color-accent-red)',
    actualValue: `${actualPct}%`,
    actualSub:
      turnout.noShow > 0
        ? `${turnout.present} of ${summary.total} · ${turnout.noShow} no-show`
        : `${turnout.present} of ${summary.total}`,
  }
}
