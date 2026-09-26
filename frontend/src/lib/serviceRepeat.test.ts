import { describe, expect, it } from 'vitest'
import { repeatOptions, repeatSummary, upcomingRepeats } from './serviceRepeat'

/*
 * These dates are the ones the migration's `series_date` produced when it
 * was run against Postgres (0105). The form shows this file's dates and
 * the database makes the services, so the two have to agree.
 */
describe('the dates a repeat lands on', () => {
  it('comes round every week', () => {
    expect(upcomingRepeats('2026-09-27', 'weekly')).toEqual([
      '2026-09-27',
      '2026-10-04',
      '2026-10-11',
      '2026-10-18',
    ])
  })

  it('comes round every two weeks', () => {
    expect(upcomingRepeats('2026-09-27', 'fortnightly')).toEqual([
      '2026-09-27',
      '2026-10-11',
      '2026-10-25',
      '2026-11-08',
    ])
  })

  it('keeps the first Sunday of the month on the first Sunday', () => {
    expect(upcomingRepeats('2026-10-04', 'monthly_weekday')).toEqual([
      '2026-10-04',
      '2026-11-01',
      '2026-12-06',
      '2027-01-03',
    ])
  })

  it('keeps the third Sunday on the third', () => {
    expect(upcomingRepeats('2026-10-18', 'monthly_weekday')).toEqual([
      '2026-10-18',
      '2026-11-15',
      '2026-12-20',
      '2027-01-17',
    ])
  })

  /*
   * Most months have no fifth Sunday. Picked from a fifth one, it means
   * "the last Sunday" — November 2026 has five, so the 29th.
   */
  it('reads a fifth Sunday as the last one', () => {
    expect(upcomingRepeats('2026-08-30', 'monthly_weekday')).toEqual([
      '2026-08-30',
      '2026-09-27',
      '2026-10-25',
      '2026-11-29',
    ])
  })

  it('keeps the same date each month, and the last day when a month is short', () => {
    expect(upcomingRepeats('2026-01-31', 'monthly_date')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })
})

describe('how the choices read', () => {
  it('names the day that was picked, so a wrong one shows before it repeats', () => {
    const labels = repeatOptions('2026-10-04').map((o) => o.label)
    expect(labels).toEqual([
      'Doesn’t repeat',
      'Every week on Sunday',
      'Every two weeks on Sunday',
      'Monthly on the first Sunday',
      'Monthly on the 4th',
    ])
  })

  it('says "last" for a fifth weekday, and gets 11th–13th right', () => {
    expect(repeatOptions('2026-08-30').map((o) => o.label)).toContain('Monthly on the last Sunday')
    expect(repeatOptions('2026-10-11').map((o) => o.label)).toContain('Monthly on the 11th')
    expect(repeatOptions('2026-10-22').map((o) => o.label)).toContain('Monthly on the 22nd')
  })

  it('still offers every choice before a date is picked', () => {
    expect(repeatOptions('').map((o) => o.value)).toEqual([
      'none',
      'weekly',
      'fortnightly',
      'monthly_weekday',
      'monthly_date',
    ])
  })

  it('tells a repeating service where it came from', () => {
    expect(repeatSummary('weekly', '2026-09-27')).toBe('Repeats every week on Sunday')
    expect(repeatSummary('monthly_weekday', '2026-10-04')).toBe(
      'Repeats monthly on the first Sunday',
    )
    expect(repeatSummary('monthly_date', '2026-10-04')).toBe('Repeats monthly on the 4th')
  })
})
