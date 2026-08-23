import { describe, expect, it } from 'vitest'
import { addMinutesIso, combineDateAndTime, formatTime, timeInputValue } from './time'

// formatTime/timeInputValue/combineDateAndTime all go through the local
// Date methods, so assertions are written to be timezone-independent
// (round-trips and relative diffs) rather than hardcoded against one zone.

describe('timeInputValue', () => {
  it('pads single-digit hours and minutes to two digits', () => {
    const iso = new Date(2026, 0, 1, 9, 5).toISOString()
    expect(timeInputValue(iso)).toBe('09:05')
  })

  it('round-trips through combineDateAndTime', () => {
    const combined = combineDateAndTime('2026-03-15', '14:30')
    expect(timeInputValue(combined)).toBe('14:30')
  })
})

describe('combineDateAndTime', () => {
  it('produces a valid, parseable ISO string', () => {
    const result = combineDateAndTime('2026-06-01', '08:00')
    expect(() => new Date(result)).not.toThrow()
    expect(Number.isNaN(new Date(result).getTime())).toBe(false)
  })
})

describe('addMinutesIso', () => {
  it('advances the timestamp by exactly the given number of minutes', () => {
    const start = '2026-01-01T09:00:00.000Z'
    const result = addMinutesIso(start, 45)
    const diffMs = new Date(result).getTime() - new Date(start).getTime()
    expect(diffMs).toBe(45 * 60_000)
  })

  it('handles zero minutes as a no-op', () => {
    const start = '2026-01-01T09:00:00.000Z'
    expect(addMinutesIso(start, 0)).toBe(start)
  })

  it('handles crossing an hour boundary', () => {
    const start = '2026-01-01T09:50:00.000Z'
    const result = addMinutesIso(start, 20)
    expect(result).toBe('2026-01-01T10:10:00.000Z')
  })
})

describe('formatTime', () => {
  it('returns a non-empty, locale-formatted string', () => {
    const iso = new Date(2026, 0, 1, 13, 0).toISOString()
    expect(formatTime(iso)).toEqual(expect.any(String))
    expect(formatTime(iso).length).toBeGreaterThan(0)
  })
})
