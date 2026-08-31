import { describe, expect, it } from 'vitest'
import { lastWeeklyClear, lastWeeklyClearDate } from './plannerWeek'

const utc = (iso: string) => new Date(iso)
const asIso = (ms: number) => new Date(ms).toISOString()

describe('the weekly boundary', () => {
  it('is this morning when today is Tuesday, not a week ago', () => {
    // 2026-08-25 is a Tuesday.
    expect(asIso(lastWeeklyClear(utc('2026-08-25T09:00:00Z')))).toBe('2026-08-25T00:00:00.000Z')
    // Including the first minute of it.
    expect(asIso(lastWeeklyClear(utc('2026-08-25T00:00:01Z')))).toBe('2026-08-25T00:00:00.000Z')
  })

  it('reaches back to the Tuesday just gone on every other day', () => {
    expect(asIso(lastWeeklyClear(utc('2026-08-26T12:00:00Z')))).toBe('2026-08-25T00:00:00.000Z')
    // Sunday: the service day itself still belongs to the week before.
    expect(asIso(lastWeeklyClear(utc('2026-08-30T18:00:00Z')))).toBe('2026-08-25T00:00:00.000Z')
    // Monday, the last day before it turns over.
    expect(asIso(lastWeeklyClear(utc('2026-08-31T23:59:00Z')))).toBe('2026-08-25T00:00:00.000Z')
    // And the next Tuesday starts a fresh week.
    expect(asIso(lastWeeklyClear(utc('2026-09-01T00:00:00Z')))).toBe('2026-09-01T00:00:00.000Z')
  })

  it('gives the same moment as a plain date for filtering by day', () => {
    expect(lastWeeklyClearDate(utc('2026-08-30T18:00:00Z'))).toBe('2026-08-25')
  })
})

describe('a week that turns over on a different day', () => {
  it('walks back to the configured day rather than always Tuesday', () => {
    // Wednesday 2 September 2026.
    const wed = new Date('2026-09-02T12:00:00Z')
    expect(lastWeeklyClearDate(wed, 0)).toBe('2026-08-30') // Sunday
    expect(lastWeeklyClearDate(wed, 1)).toBe('2026-08-31') // Monday
    // Wednesday itself: the boundary is this morning, not a week back.
    expect(lastWeeklyClearDate(wed, 3)).toBe('2026-09-02')
    expect(lastWeeklyClearDate(wed, 4)).toBe('2026-08-27') // Thursday, a week back
  })

  it('still defaults to Tuesday for anyone who has not set one', () => {
    const wed = new Date('2026-09-02T12:00:00Z')
    expect(lastWeeklyClearDate(wed)).toBe('2026-09-01')
  })
})
