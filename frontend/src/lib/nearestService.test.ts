import { describe, expect, it } from 'vitest'
import { nearestServiceDate } from './nearestService'

describe('nearestServiceDate', () => {
  it('returns null when there are no services', () => {
    expect(nearestServiceDate([], '2026-08-27')).toBeNull()
  })

  it('prefers today over anything later', () => {
    expect(nearestServiceDate(['2026-09-06', '2026-08-27', '2026-08-30'], '2026-08-27')).toBe('2026-08-27')
  })

  it('picks the soonest upcoming day, not the first in the list', () => {
    expect(nearestServiceDate(['2026-09-20', '2026-08-30', '2026-09-06'], '2026-08-27')).toBe('2026-08-30')
  })

  it('ignores past days while an upcoming one exists', () => {
    expect(nearestServiceDate(['2026-08-02', '2026-09-06'], '2026-08-27')).toBe('2026-09-06')
  })

  it('falls back to the most recent past day when nothing is upcoming', () => {
    expect(nearestServiceDate(['2026-07-05', '2026-08-02'], '2026-08-27')).toBe('2026-08-02')
  })
})
