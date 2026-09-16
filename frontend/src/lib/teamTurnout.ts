/**
 * What a team's ring says, before the day and on it.
 *
 * A team is two questions a week apart. Before Sunday: how much of this
 * team is coming? On Sunday: how much of it is here? The tile used to
 * answer only the second, and only once somebody had started marking
 * people in — so all week it showed an empty grey ring and a count, and
 * the head planning Saturday night had no number at all.
 *
 * So the ring carries a **predicted** figure until the register is
 * finished, and the **actual** one after. Both are measured against the
 * whole team, so the two can be read against each other: 70% expected,
 * 50% turned up, and the gap is the story.
 *
 * The colour answers the narrower question the number cannot. A team where
 * seven of ten said yes and all seven came is at 70% of its roster and has
 * done everything it said it would, so it is green; the missing three are
 * an availability problem, already visible in the predicted number, not a
 * turnout one. Colour is about whether people kept their word; the
 * percentage is about how much of the team you have.
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
  /** What the ring fills to: the predicted share until settled, then the real one. */
  pct: number
  /** Share of the whole team who said they would come, 0–100. */
  predictedPct: number
  /** Share of the whole team confirmed present, or null before any mark. */
  actualPct: number | null
  /** The ring's colour, as a theme token. */
  color: string
  /** The line under the team's name. */
  caption: string
  /** The quieter line under that, counting the people behind the figure. */
  detail: string
}

const PENDING = 'var(--color-status-pending, var(--color-on-surface-faint))'
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export function turnoutRing(summary: AvailabilitySummary, turnout: Turnout): TurnoutRing {
  const predictedPct = share(summary.available, summary.total)
  const marked = turnout.present + turnout.noShow
  const actualPct = marked > 0 ? share(turnout.present, summary.total) : null

  // Nobody available is a real, actionable emptiness — not an absence of
  // data — so it reads as 0% rather than as a dash, exactly as it would
  // if everyone who promised had failed to show.
  if (turnout.committed === 0) {
    return {
      state: 'none-available',
      pct: 0,
      predictedPct: 0,
      actualPct,
      color: 'var(--color-accent-red)',
      caption: 'Nobody available yet',
      detail:
        summary.noAnswer > 0
          ? `0 of ${summary.total} said yes · ${summary.noAnswer} unanswered`
          : `0 of ${summary.total} said yes`,
    }
  }

  // Said yes, but nobody has been marked. Grey, because a prediction is
  // not a fact and should not wear the colour of one.
  if (marked === 0) {
    return {
      state: 'predicted',
      pct: predictedPct,
      predictedPct,
      actualPct: null,
      color: PENDING,
      caption: `${predictedPct}% expected`,
      detail:
        summary.noAnswer > 0
          ? `${turnout.committed} of ${summary.total} said yes · ${summary.noAnswer} unanswered`
          : `${turnout.committed} of ${summary.total} said yes`,
    }
  }

  // The register is open and part-filled. The headline stays the
  // prediction: with five expected and one marked, turnout is technically
  // 20%, and a tile that shouts 20% at nine in the morning is telling the
  // truth in a way that misleads.
  if (turnout.unconfirmed > 0) {
    return {
      state: 'counting',
      pct: predictedPct,
      predictedPct,
      actualPct,
      color: PENDING,
      caption: `${predictedPct}% expected`,
      detail: `${turnout.present} of ${turnout.committed} in so far`,
    }
  }

  // Everyone who said yes has been accounted for, so the real figure takes
  // over — and the colour reports whether the team kept its word.
  const kept = share(turnout.present, turnout.committed)
  return {
    state: 'settled',
    pct: actualPct ?? 0,
    predictedPct,
    actualPct,
    color:
      kept === 100
        ? 'var(--color-accent-green)'
        : kept > 0
          ? 'var(--color-accent-orange)'
          : 'var(--color-accent-red)',
    caption: `${actualPct}% turned up`,
    detail:
      turnout.noShow > 0
        ? `${turnout.present} of ${summary.total} in · ${turnout.noShow} no-show`
        : `${turnout.present} of ${summary.total} in · expected ${predictedPct}%`,
  }
}
