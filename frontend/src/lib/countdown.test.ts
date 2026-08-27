import { describe, expect, it } from 'vitest'
import { countdownIsClockworthy, countdownParts } from './countdown'

describe('countdownParts', () => {
  it('splits a duration into padded clock parts', () => {
    expect(countdownParts((2 * 3600 + 5 * 60 + 9) * 1000)).toEqual({
      hrs: '02',
      mins: '05',
      secs: '09',
    })
  })

  it('floors at zero rather than counting backwards', () => {
    expect(countdownParts(-5000)).toEqual({ hrs: '00', mins: '00', secs: '00' })
  })
})

describe('countdownIsClockworthy', () => {
  it('is for the last day only', () => {
    expect(countdownIsClockworthy(3 * 3600 * 1000)).toBe(true)
    expect(countdownIsClockworthy(30 * 3600 * 1000)).toBe(false)
    expect(countdownIsClockworthy(0)).toBe(false)
  })
})
