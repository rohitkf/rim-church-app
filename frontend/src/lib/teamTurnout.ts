/**
 * The one number a team's ring should show.
 *
 * It used to show availability — the share of the roster who said yes —
 * next to a caption counting who actually turned up, so a team could read
 * "100% · 1/2 in" and be both at once. Two questions, one ring, and the
 * ring answered the less useful one: by the time you are looking at this
 * tile on a Sunday morning, whether people said yes last week matters far
 * less than whether they are here.
 *
 * So the ring is turnout, measured against the people who said they would
 * come. A team where one of one said yes and arrived is complete; a team
 * where nobody said yes at all is not "0 out of 0, fine" — it is the
 * emptiest a team can be, and it goes red.
 */
import type { AvailabilitySummary } from './availabilitySummary'
import type { Turnout } from './turnout'

export type TurnoutRingState =
  /** Nobody said they could serve. The worst case, and the loudest. */
  | 'none-available'
  /** People said yes; nobody has been marked present or absent yet. */
  | 'awaiting'
  /** Some of those who said yes are here. */
  | 'partial'
  /** Everyone who said yes is here. */
  | 'complete'

export interface TurnoutRing {
  state: TurnoutRingState
  /** Of those who said they would come, the share who did. 0–100. */
  pct: number
  /** The ring's colour, as a theme token. */
  color: string
  /** The line under the team's name. */
  caption: string
}

export function turnoutRing(summary: AvailabilitySummary, turnout: Turnout): TurnoutRing {
  const recorded = turnout.present + turnout.noShow > 0

  // Nobody available is a real, actionable emptiness — not an absence of
  // data — so it reads as 0% rather than as a dash, exactly as it would
  // if everyone who promised had failed to show.
  if (turnout.committed === 0) {
    return {
      state: 'none-available',
      pct: 0,
      color: 'var(--color-accent-red)',
      caption:
        summary.noAnswer > 0
          ? `Nobody available yet · ${summary.noAnswer} unanswered`
          : `Nobody available · 0/${summary.total}`,
    }
  }

  // Said yes, but the doors haven't opened. Grey, because "not yet" and
  // "didn't come" are different things and only one of them is a problem.
  if (!recorded) {
    return {
      state: 'awaiting',
      pct: 0,
      color: 'var(--color-status-pending, var(--color-on-surface-faint))',
      caption:
        summary.noAnswer > 0
          ? `${turnout.committed} available · ${summary.noAnswer} unanswered`
          : `${turnout.committed} available · not checked in`,
    }
  }

  const pct = Math.round((turnout.present / turnout.committed) * 100)
  return {
    state: pct === 100 ? 'complete' : 'partial',
    pct,
    color:
      pct === 100
        ? 'var(--color-accent-green)'
        : pct >= 50
          ? 'var(--color-accent-orange)'
          : 'var(--color-accent-red)',
    caption: `${pct}% · ${turnout.present}/${turnout.committed} in`,
  }
}
