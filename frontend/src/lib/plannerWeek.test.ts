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
