import { describe, expect, it } from 'vitest'
import { availabilitySummary } from './availabilitySummary'

describe('availabilitySummary', () => {
  it('counts each status and the people who never answered', () => {
    const s = availabilitySummary(
      ['u1', 'u2', 'u3', 'u4'],
      [
        { user_id: 'u1', status: 'available' },
        { user_id: 'u2', status: 'tentative' },
        { user_id: 'u3', status: 'unavailable' },
      ],
    )
    expect(s).toEqual({ total: 4, available: 1, tentative: 1, unavailable: 1, noAnswer: 1, pct: 25 })
  })

  it('measures the percentage against the whole roster, not just responders', () => {
    const s = availabilitySummary(['u1', 'u2', 'u3', 'u4'], [{ user_id: 'u1', status: 'available' }])
    expect(s.pct).toBe(25)
    expect(s.noAnswer).toBe(3)
  })

  it('ignores answers from people no longer on the team', () => {
    const s = availabilitySummary(
      ['u1'],
      [
        { user_id: 'u1', status: 'available' },
        { user_id: 'gone', status: 'available' },
      ],
    )
    expect(s).toEqual({ total: 1, available: 1, tentative: 0, unavailable: 0, noAnswer: 0, pct: 100 })
  })

  it('handles an empty team without dividing by zero', () => {
    expect(availabilitySummary([], [])).toEqual({
      total: 0,
      available: 0,
      tentative: 0,
      unavailable: 0,
      noAnswer: 0,
      pct: 0,
    })
  })

  it('reaches 100% when everyone says yes', () => {
    const s = availabilitySummary(
      ['u1', 'u2'],
      [
        { user_id: 'u1', status: 'available' },
        { user_id: 'u2', status: 'available' },
      ],
    )
    expect(s.pct).toBe(100)
  })
})
