import { describe, expect, it } from 'vitest'
import { ageFrom } from './celebrations'

const on = (iso: string) => new Date(`${iso}T12:00:00Z`)

describe('ageFrom', () => {
  it('counts whole years', () => {
    expect(ageFrom('1990-03-14', on('2026-09-01'))).toBe(36)
  })

  it('does not count a birthday that has not come round yet', () => {
    expect(ageFrom('1990-12-25', on('2026-09-01'))).toBe(35)
    expect(ageFrom('1990-09-02', on('2026-09-01'))).toBe(35)
  })

  it('counts it on the day itself', () => {
    expect(ageFrom('1990-09-01', on('2026-09-01'))).toBe(36)
  })

  it('says nothing when there is nothing to say', () => {
    expect(ageFrom(null)).toBeNull()
    expect(ageFrom(undefined)).toBeNull()
    expect(ageFrom('')).toBeNull()
  })

  it('refuses a placeholder year rather than reporting an age from it', () => {
    // Some profiles carry a birthday with no real year behind it.
    expect(ageFrom('1800-01-01', on('2026-09-01'))).toBeNull()
  })
})
