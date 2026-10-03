import { describe, expect, it } from 'vitest'
import { shortDuration } from './settingsReadout'

describe('shortDuration', () => {
  it('says minutes the way a person would', () => {
    expect(shortDuration(45, 'minutes')).toBe('45 min')
    expect(shortDuration(60, 'minutes')).toBe('1 h')
    expect(shortDuration(90, 'minutes')).toBe('1 h 30 min')
    expect(shortDuration(720, 'minutes')).toBe('12 h')
  })

  it('rounds whole days up into days', () => {
    expect(shortDuration(1440, 'minutes')).toBe('1 day')
    expect(shortDuration(2880, 'minutes')).toBe('2 days')
  })

  it('calls nothing "None" rather than "0 min"', () => {
    expect(shortDuration(0, 'minutes')).toBe('None')
  })

  it('counts days as days', () => {
    expect(shortDuration(1, 'days')).toBe('1 day')
    expect(shortDuration(30, 'days')).toBe('30 days')
  })
})
