import { describe, expect, it } from 'vitest'
import { timeLeft } from './timeLeft'

describe('what is left until a moment', () => {
  const now = new Date('2026-11-03T12:00:00Z')
  it('is days, hours, minutes and seconds', () => {
    expect(timeLeft('2026-11-05T16:30:05Z', now)).toEqual({ days: 2, hours: 4, minutes: 30, seconds: 5 })
    expect(timeLeft('2026-11-03T12:00:59Z', now)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 59 })
  })
  it('is nothing once the moment has passed, or for no moment at all', () => {
    expect(timeLeft('2026-11-03T12:00:00Z', now)).toBeNull()
    expect(timeLeft('2026-11-01T12:00:00Z', now)).toBeNull()
    expect(timeLeft('not a date', now)).toBeNull()
  })
})
