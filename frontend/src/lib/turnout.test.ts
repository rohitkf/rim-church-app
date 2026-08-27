import { describe, expect, it } from 'vitest'
import { combineTurnout, turnoutFrom } from './turnout'
import type { AvailabilityStatus } from './types'

const roster = ['a', 'b', 'c', 'd']

function answer(
  user_id: string,
  status: AvailabilityStatus,
  attended: boolean | null = null,
): { user_id: string; status: AvailabilityStatus; attended: boolean | null } {
  return { user_id, status, attended }
}

describe('turnoutFrom', () => {
  it('measures turnout against the roster, not against who said yes', () => {
    // One of four said yes and turned up. That is a quarter of the team
    // present, not a full house.
    const t = turnoutFrom(roster, [answer('a', 'available', true)])
    expect(t.expected).toBe(4)
    expect(t.present).toBe(1)
    expect(t.pct).toBe(25)
  })

  it('still reports how well the estimate held', () => {
    const t = turnoutFrom(roster, [answer('a', 'available', true)])
    expect(t.committed).toBe(1)
    expect(t.keptPct).toBe(100)
  })

  it('counts a team nobody could serve on as a gap, not as nothing', () => {
    const t = turnoutFrom(['a'], [answer('a', 'unavailable')])
    expect(t.expected).toBe(1)
    expect(t.present).toBe(0)
    // Nothing was recorded on the day, so there is no percentage to show —
    // the gap is visible in 0 of 1 rather than in a misleading 0%.
    expect(t.pct).toBeNull()
  })

  it('ignores answers from people who are not on the roster', () => {
    // A guest, or someone who has since left the team, answers too. The
    // estimate does not count them, so neither can this.
    const t = turnoutFrom(['a'], [answer('a', 'available', true), answer('guest', 'available', true)])
    expect(t.expected).toBe(1)
    expect(t.present).toBe(1)
    expect(t.pct).toBe(100)
  })

  it('separates a no-show from someone not yet checked in', () => {
    const t = turnoutFrom(roster, [
      answer('a', 'available', true),
      answer('b', 'available', false),
      answer('c', 'available', null),
    ])
    expect(t.noShow).toBe(1)
    expect(t.unconfirmed).toBe(1)
    expect(t.pct).toBe(25)
    expect(t.keptPct).toBe(33)
  })

  it('ignores an attended flag on someone who never committed', () => {
    const t = turnoutFrom(['a'], [answer('a', 'unavailable', true)])
    expect(t.present).toBe(0)
    expect(t.committed).toBe(0)
  })

  it('holds back a percentage until someone has been marked either way', () => {
    expect(turnoutFrom(roster, []).pct).toBeNull()
    expect(turnoutFrom(roster, [answer('a', 'available')]).pct).toBeNull()
    expect(turnoutFrom(roster, [answer('a', 'available', false)]).pct).toBe(0)
  })

  it('has nothing to say about a team with no core members', () => {
    expect(turnoutFrom([], [])).toMatchObject({ expected: 0, pct: null, keptPct: null })
  })

  it('reaches 100% only when the whole roster is there', () => {
    const t = turnoutFrom(['a', 'b'], [answer('a', 'available', true), answer('b', 'available', true)])
    expect(t.pct).toBe(100)
  })
})

describe('combineTurnout', () => {
  it('adds the rosters up, so an absent team drags the service down', () => {
    // Media: 1 of 2 there. Service Flow: nobody said yes. Stage: 1 of 1.
    // The service is half-staffed, and the total should say so.
    const media = turnoutFrom(['a', 'b'], [answer('a', 'available', true), answer('b', 'tentative')])
    const flow = turnoutFrom(['c'], [answer('c', 'unavailable')])
    const stage = turnoutFrom(['d'], [answer('d', 'available', true)])

    const all = combineTurnout([media, flow, stage])
    expect(all.expected).toBe(4)
    expect(all.present).toBe(2)
    expect(all.pct).toBe(50)
  })

  it('keeps the reliability figure separate from the coverage figure', () => {
    const media = turnoutFrom(['a', 'b'], [answer('a', 'available', true), answer('b', 'tentative')])
    const flow = turnoutFrom(['c'], [answer('c', 'unavailable')])
    const all = combineTurnout([media, flow])
    expect(all.pct).toBe(33)
    expect(all.keptPct).toBe(100)
  })

  it('stays silent when no team has recorded anything', () => {
    const a = turnoutFrom(['a'], [answer('a', 'available')])
    const b = turnoutFrom(['b'], [])
    expect(combineTurnout([a, b]).pct).toBeNull()
  })

  it('adds up to nothing when there is nothing to add', () => {
    expect(combineTurnout([])).toMatchObject({ expected: 0, present: 0, pct: null })
  })
})
