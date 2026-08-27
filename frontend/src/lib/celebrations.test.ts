import { describe, expect, it } from 'vitest'
import { nextOccurrence, upcomingCelebrations, whenLabel } from './celebrations'

describe('nextOccurrence', () => {
  it('uses this year when the date is still to come', () => {
    expect(nextOccurrence('1990-12-25', '2026-08-27')).toBe('2026-12-25')
  })

  it('rolls into next year once it has passed', () => {
    expect(nextOccurrence('1990-03-04', '2026-08-27')).toBe('2027-03-04')
  })

  it('counts today itself as the next occurrence', () => {
    expect(nextOccurrence('1990-08-27', '2026-08-27')).toBe('2026-08-27')
  })

  it('marks 29 February on the 28th in a common year', () => {
    expect(nextOccurrence('1996-02-29', '2026-01-01')).toBe('2026-02-28')
    expect(nextOccurrence('1996-02-29', '2028-01-01')).toBe('2028-02-29')
  })
})

describe('upcomingCelebrations', () => {
  const people = [
    { id: 'a', first_name: 'Ann', last_name: 'Ng', dob: '1990-09-02', anniversary: '2015-08-30' },
    { id: 'b', first_name: 'Bob', last_name: 'Roy', dob: '1985-08-27', anniversary: null },
    { id: 'c', first_name: 'Cal', last_name: 'Kim', dob: '1970-01-15', anniversary: null },
  ]

  it('lists what is coming, soonest first, with both kinds', () => {
    const found = upcomingCelebrations(people, '2026-08-27', 30)
    expect(found.map((o) => [o.name, o.kind, o.daysAway])).toEqual([
      ['Bob Roy', 'birthday', 0],
      ['Ann Ng', 'anniversary', 3],
      ['Ann Ng', 'birthday', 6],
    ])
  })

  it('leaves out anything past the window', () => {
    const found = upcomingCelebrations(people, '2026-08-27', 30)
    expect(found.some((o) => o.name === 'Cal Kim')).toBe(false)
    expect(upcomingCelebrations(people, '2026-08-27', 200).some((o) => o.name === 'Cal Kim')).toBe(true)
  })

  it('works out the milestone year', () => {
    const [birthday] = upcomingCelebrations([people[1]], '2026-08-27', 1)
    expect(birthday.years).toBe(41)
    const [anniversary] = upcomingCelebrations([people[0]], '2026-08-27', 5)
    expect(anniversary.years).toBe(11)
  })

  it('lists a date with a placeholder year without claiming an age', () => {
    const found = upcomingCelebrations(
      [{ id: 'd', first_name: 'Dee', last_name: 'Fox', dob: '1900-08-28' }],
      '2026-08-27',
      30,
    )
    expect(found[0].daysAway).toBe(1)
    expect(found[0].years).toBeNull()
  })

  it('ignores people with no dates on file', () => {
    expect(upcomingCelebrations([{ id: 'e', first_name: 'Eve', last_name: 'Li' }], '2026-08-27')).toEqual([])
  })
})

describe('whenLabel', () => {
  it('says how far off it is in words', () => {
    expect(whenLabel(0)).toBe('Today')
    expect(whenLabel(1)).toBe('Tomorrow')
    expect(whenLabel(4)).toBe('In 4 days')
    expect(whenLabel(9)).toBe('Next week')
    expect(whenLabel(30)).toBe('In 4 weeks')
  })
})
