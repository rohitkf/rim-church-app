import { describe, expect, it } from 'vitest'
import { combineTurnout, turnoutFrom } from './turnout'

describe('turnoutFrom', () => {
  it('counts only people who committed as expected', () => {
    const t = turnoutFrom([
      { status: 'available', attended: true },
      { status: 'available', attended: null },
      { status: 'tentative', attended: null },
      { status: 'unavailable', attended: null },
    ])
    expect(t.expected).toBe(2)
    expect(t.actual).toBe(1)
    expect(t.unconfirmed).toBe(1)
    expect(t.pct).toBe(50)
  })

  it('separates confirmed absences from unconfirmed ones', () => {
    const t = turnoutFrom([
      { status: 'available', attended: true },
      { status: 'available', attended: false },
      { status: 'available', attended: null },
    ])
    expect(t).toEqual({ expected: 3, actual: 1, noShow: 1, unconfirmed: 1, pct: 33 })
  })

  it('ignores an attended flag on someone who never committed', () => {
    const t = turnoutFrom([{ status: 'unavailable', attended: true }])
    expect(t.expected).toBe(0)
    expect(t.actual).toBe(0)
  })

  it('has no percentage before anyone says yes', () => {
    expect(turnoutFrom([]).pct).toBeNull()
    expect(turnoutFrom([{ status: 'tentative', attended: null }]).pct).toBeNull()
  })

  it('reaches 100% when everyone who committed turned up', () => {
    const t = turnoutFrom([
      { status: 'available', attended: true },
      { status: 'available', attended: true },
    ])
    expect(t.pct).toBe(100)
  })
})

describe('combineTurnout', () => {
  it('sums teams and recomputes the percentage over the total', () => {
    const a = turnoutFrom([
      { status: 'available', attended: true },
      { status: 'available', attended: false },
    ])
    const b = turnoutFrom([
      { status: 'available', attended: true },
      { status: 'available', attended: true },
    ])
    expect(combineTurnout([a, b])).toEqual({
      expected: 4,
      actual: 3,
      noShow: 1,
      unconfirmed: 0,
      pct: 75,
    })
  })

  it('is empty for no teams', () => {
    expect(combineTurnout([])).toEqual({ expected: 0, actual: 0, noShow: 0, unconfirmed: 0, pct: null })
  })
})
