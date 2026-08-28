import { describe, expect, it } from 'vitest'
import { formatDuration } from './duration'

describe('formatDuration', () => {
  it('says minutes on their own under an hour', () => {
    expect(formatDuration(25)).toBe('25m')
    expect(formatDuration(59)).toBe('59m')
  })

  it('leads with the hour, which is the part that says whether it fits', () => {
    expect(formatDuration(85)).toBe('1h 25m')
    expect(formatDuration(150)).toBe('2h 30m')
  })

  it('drops a zero remainder rather than writing "1h 0m"', () => {
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(120)).toBe('2h')
  })

  it('treats nothing as nothing', () => {
    expect(formatDuration(0)).toBe('0m')
    expect(formatDuration(-10)).toBe('0m')
    expect(formatDuration(Number.NaN)).toBe('0m')
  })
})
