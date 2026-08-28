import { describe, expect, it } from 'vitest'
import { turnoutRing } from './teamTurnout'
import { availabilitySummary } from './availabilitySummary'
import { turnoutFrom } from './turnout'

type Answer = Parameters<typeof turnoutFrom>[1][number]

const ring = (memberIds: string[], answers: Answer[]) =>
  turnoutRing(availabilitySummary(memberIds, answers), turnoutFrom(memberIds, answers))

describe('the ring on a team in the Teams on duty tile', () => {
  it('counts who turned up against who said they would, not against the roster', () => {
    // Two on the roster, one said yes, and that one came. The team did
    // everything it said it would, so the ring is full — the old ring
    // called this 50% by measuring against the roster instead.
    const r = ring(['a', 'b'], [{ user_id: 'a', status: 'available', attended: true }])
    expect(r.pct).toBe(100)
    expect(r.state).toBe('complete')
    expect(r.caption).toBe('100% · 1/1 in')
  })

  it('is partial while some of those who promised are missing', () => {
    const r = ring(
      ['a', 'b'],
      [
        { user_id: 'a', status: 'available', attended: true },
        { user_id: 'b', status: 'available', attended: false },
      ],
    )
    expect(r.pct).toBe(50)
    expect(r.state).toBe('partial')
    expect(r.color).toContain('orange')
  })

  it('goes red at zero when nobody said they could serve', () => {
    const r = ring(['a', 'b'], [])
    expect(r.pct).toBe(0)
    expect(r.state).toBe('none-available')
    expect(r.color).toContain('red')
    expect(r.caption).toContain('2 unanswered')
  })

  it('counts a team that answered no as nobody available, not as no data', () => {
    const r = ring(['a'], [{ user_id: 'a', status: 'unavailable', attended: null }])
    expect(r.state).toBe('none-available')
    expect(r.caption).toBe('Nobody available · 0/1')
  })

  it('stays grey before the doors open, because "not yet" is not "did not come"', () => {
    const r = ring(['a', 'b'], [{ user_id: 'a', status: 'available', attended: null }])
    expect(r.state).toBe('awaiting')
    expect(r.pct).toBe(0)
    expect(r.color).not.toContain('red')
    expect(r.caption).toContain('1 available')
  })
})
