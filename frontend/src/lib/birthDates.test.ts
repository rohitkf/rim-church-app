import { describe, expect, it } from 'vitest'
import { celebrationDate, fullDate } from './birthDates'
import { upcomingCelebrations } from './celebrations'

describe('dates of birth through birth_dates() (0256)', () => {
  it('marks the day without the year, and says no age from it', () => {
    const date = celebrationDate({ id: 'a', dob: null, birthday: '11-10' })
    expect(date).toBe('1900-11-10')
    const [occasion] = upcomingCelebrations([{ id: 'a', first_name: 'Asha', last_name: 'M', dob: date }], '2026-11-08', 7)
    expect(occasion.nextIso).toBe('2026-11-10')
    expect(occasion.years).toBeNull()
  })

  it('keeps 29 February', () => {
    const date = celebrationDate({ id: 'a', dob: null, birthday: '02-29' })
    const [occasion] = upcomingCelebrations([{ id: 'a', first_name: 'Asha', last_name: 'M', dob: date }], '2027-02-25', 7)
    expect(occasion.nextIso).toBe('2027-02-28')
  })

  it('uses the whole date where it is given', () => {
    const row = { id: 'a', dob: '1990-11-10', birthday: '11-10' }
    expect(celebrationDate(row)).toBe('1990-11-10')
    expect(fullDate(row)).toBe('1990-11-10')
    expect(fullDate({ ...row, dob: null })).toBeNull()
    expect(celebrationDate(undefined)).toBeNull()
  })
})
