import { describe, expect, it } from 'vitest'
import { formatCountdown, nextBoardClearTime } from './boardClear'

describe('nextBoardClearTime', () => {
  it('finds the coming Tuesday 00:00 UTC from a mid-week moment', () => {
    // Wednesday 2026-08-26 10:00 UTC -> Tuesday 2026-09-01 00:00 UTC
    const next = nextBoardClearTime(new Date(Date.UTC(2026, 7, 26, 10, 0)))
    expect(next.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('rolls a Tuesday after midnight over to the following week', () => {
    // Tuesday 2026-09-01 00:00:01 UTC has just been cleared -> next is 09-08
    const next = nextBoardClearTime(new Date(Date.UTC(2026, 8, 1, 0, 0, 1)))
    expect(next.toISOString()).toBe('2026-09-08T00:00:00.000Z')
  })

  it('uses the same day when it is Monday', () => {
    // Monday 2026-08-31 23:59 UTC -> Tuesday 2026-09-01 00:00 UTC
    const next = nextBoardClearTime(new Date(Date.UTC(2026, 7, 31, 23, 59)))
    expect(next.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('formatCountdown', () => {
  it('shows days, hours, minutes and seconds for long spans', () => {
    const ms = ((3 * 24 + 4) * 60 + 12) * 60_000 + 7_000
    expect(formatCountdown(ms)).toBe('3d 4h 12m 7s')
  })

  it('drops days when under 24 hours', () => {
    expect(formatCountdown((5 * 60 + 30) * 60_000 + 1_000)).toBe('5h 30m 1s')
  })

  it('shows minutes and seconds in the final hour', () => {
    expect(formatCountdown(9 * 60_000 + 42_000)).toBe('9m 42s')
  })

  it('handles the boundary moment', () => {
    expect(formatCountdown(0)).toBe('any moment now')
  })
})
