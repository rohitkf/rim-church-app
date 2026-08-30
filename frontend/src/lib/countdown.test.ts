import { describe, expect, it } from 'vitest'
import { countdownIsClockworthy, countdownParts, formatCountdown } from './countdown'

describe('countdownParts', () => {
  it('splits a duration into padded clock parts', () => {
    expect(countdownParts((2 * 3600 + 5 * 60 + 9) * 1000)).toEqual({
      days: 0,
      hrs: '02',
      mins: '05',
      secs: '09',
    })
  })

  it('takes whole days out of the hours rather than piling them in', () => {
    // Six days and change is the ordinary gap between two Sundays, and the
    // hours have to stay a clock: 158 hours is not one.
    expect(countdownParts(((6 * 24 + 14) * 3600 + 22 * 60 + 31) * 1000)).toEqual({
      days: 6,
      hrs: '14',
      mins: '22',
      secs: '31',
    })
  })

  it('floors at zero rather than counting backwards', () => {
    expect(countdownParts(-5000)).toEqual({ days: 0, hrs: '00', mins: '00', secs: '00' })
  })
})

describe('countdownIsClockworthy', () => {
  it('runs however far out the service is', () => {
    expect(countdownIsClockworthy(3 * 3600 * 1000)).toBe(true)
    expect(countdownIsClockworthy(30 * 3600 * 1000)).toBe(true)
    // A whole week away — the gap between two Sundays — still gets a clock.
    expect(countdownIsClockworthy(7 * 24 * 3600 * 1000)).toBe(true)
  })

  it('gives up on a distance no clock can mean anything at', () => {
    expect(countdownIsClockworthy(200 * 24 * 3600 * 1000)).toBe(false)
  })

  it('is nothing to count once the moment has passed', () => {
    expect(countdownIsClockworthy(0)).toBe(false)
    expect(countdownIsClockworthy(-1000)).toBe(false)
  })
})

describe('formatCountdown', () => {
  const m = (n: number) => n * 60_000

  it('drops to the unit that matters as the gap closes', () => {
    expect(formatCountdown(m(89) + 14_000)).toBe('1h 29m')
    expect(formatCountdown(m(4) + 12_000)).toBe('4m 12s')
    expect(formatCountdown(42_000)).toBe('42s')
  })

  it('pads the seconds so the text stops jittering as it counts', () => {
    expect(formatCountdown(m(4) + 9_000)).toBe('4m 09s')
  })

  it('says due rather than counting into the negative', () => {
    expect(formatCountdown(0)).toBe('due')
    expect(formatCountdown(-90_000)).toBe('due')
  })

  it('stays inside eight characters, which is what the rail column holds', () => {
    for (const ms of [1_000, 59_000, m(1), m(59) + 59_000, m(90), m(600)]) {
      expect(formatCountdown(ms).length).toBeLessThanOrEqual(8)
    }
  })
})
