import { describe, expect, it } from 'vitest'
import { monthGrid, monthTitle } from './monthGrid'

describe('monthGrid', () => {
  // August 2026: the 1st is a Saturday, the 31st a Monday.
  const grid = monthGrid(2026, 7)

  it('always renders full Monday-first weeks', () => {
    for (const week of grid) expect(week).toHaveLength(7)
    // First row starts on Monday July 27.
    expect(grid[0][0]).toEqual({ iso: '2026-07-27', day: 27, inMonth: false })
    expect(grid[0][5]).toEqual({ iso: '2026-08-01', day: 1, inMonth: true })
  })

  it('covers the whole month and pads the last week', () => {
    const last = grid[grid.length - 1]
    expect(last.some((c) => c.iso === '2026-08-31')).toBe(true)
    expect(last[6]).toEqual({ iso: '2026-09-06', day: 6, inMonth: false })
  })

  it('puts Sundays in the last column', () => {
    for (const week of grid) {
      expect(new Date(week[6].iso + 'T12:00:00').getDay()).toBe(0)
    }
  })
})

describe('monthTitle', () => {
  it('formats month and year', () => {
    expect(monthTitle(2026, 7)).toMatch(/August/)
    expect(monthTitle(2026, 7)).toMatch(/2026/)
  })
})
