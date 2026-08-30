import { describe, expect, it } from 'vitest'
import { grantedMinutes, grantsOf, plannedMinutes, runsForMinutes } from './sessionLength'

describe('the three lengths a session has', () => {
  const session = {
    duration_minutes: 90,
    added_minutes: 18,
    added_grants: [
      { minutes: 10, note: 'Pastor asked' },
      { minutes: 8, note: null },
    ],
  }

  it('keeps the planned length knowable after time is granted', () => {
    // The whole point: 90 survives, so next month is not planned from 108.
    expect(plannedMinutes(session)).toBe(90)
    expect(grantedMinutes(session)).toBe(18)
    expect(runsForMinutes(session)).toBe(108)
  })

  it('is just the plan when nothing was granted', () => {
    const plain = { duration_minutes: 25 }
    expect(plannedMinutes(plain)).toBe(25)
    expect(grantedMinutes(plain)).toBe(0)
    expect(runsForMinutes(plain)).toBe(25)
    expect(grantsOf(plain)).toEqual([])
  })

  it('treats a missing or negative length as nothing rather than as a shift', () => {
    expect(runsForMinutes({ duration_minutes: null })).toBe(0)
    expect(runsForMinutes({ duration_minutes: -5, added_minutes: -3 })).toBe(0)
  })

  it('lists the grants in the order they were given', () => {
    expect(grantsOf(session).map((g) => g.minutes)).toEqual([10, 8])
  })

  it('ignores an empty grant rather than drawing "+0m asked"', () => {
    expect(grantsOf({ duration_minutes: 10, added_grants: [{ minutes: 0 }] })).toEqual([])
  })
})
