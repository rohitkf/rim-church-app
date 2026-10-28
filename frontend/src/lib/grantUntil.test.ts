import { describe, expect, it } from 'vitest'
import { dayOfUntil, earliestUntilDay, formatUntil, inDate, untilFromDay } from './grantUntil'

describe('a grant’s end date', () => {
  it('keeps a chosen day as the moment it ends, and reads that back as the day', () => {
    const until = untilFromDay('2026-11-12')
    expect(new Date(until).getTime()).toBe(new Date(2026, 10, 13).getTime())
    expect(dayOfUntil(until)).toBe('2026-11-12')
    // In the reader's own words: "12 Nov 2026" here, "Nov 12, 2026" across the water.
    expect(formatUntil(until)).toBe(new Date(2026, 10, 12, 12).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
  })

  it('rolls over a month and a year', () => {
    expect(dayOfUntil(untilFromDay('2026-12-31'))).toBe('2026-12-31')
    expect(new Date(untilFromDay('2026-12-31')).getTime()).toBe(new Date(2027, 0, 1).getTime())
  })

  it('offers tomorrow as the first day, and knows an ended grant from a live one', () => {
    expect(earliestUntilDay(new Date(2026, 1, 28, 9))).toBe('2026-03-01')
    const now = Date.parse('2026-11-12T10:00:00Z')
    expect(inDate(null, now)).toBe(true)
    expect(inDate('2026-11-13T00:00:00Z', now)).toBe(true)
    expect(inDate('2026-11-12T09:00:00Z', now)).toBe(false)
  })
})
