import { describe, expect, it } from 'vitest'
import { formatServiceDay, isSundayIso, shiftSundayIso } from './sunday'

describe('isSundayIso', () => {
  it('recognises Sundays regardless of the viewer’s clock time', () => {
    expect(isSundayIso('2026-08-30')).toBe(true)
    expect(isSundayIso('2026-08-31')).toBe(false)
  })
})

describe('shiftSundayIso', () => {
  it('steps a week at a time in both directions', () => {
    expect(shiftSundayIso('2026-08-30', -1)).toBe('2026-08-23')
    expect(shiftSundayIso('2026-08-30', 1)).toBe('2026-09-06')
  })

  it('crosses month and year boundaries', () => {
    expect(shiftSundayIso('2026-01-03', -1)).toBe('2025-12-27')
  })
})

describe('formatServiceDay', () => {
  it('includes the weekday and the date', () => {
    const label = formatServiceDay('2026-08-30')
    expect(label).toMatch(/Sunday/)
    expect(label).toMatch(/2026/)
  })
})
