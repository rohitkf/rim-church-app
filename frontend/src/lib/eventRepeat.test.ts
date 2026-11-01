import { describe, expect, it } from 'vitest'
import { MAX_OCCURRENCES, defaultUntil, occurrences, repeatChoices, repeatWords, shiftRun } from './eventRepeat'

describe('when a repeating event happens', () => {
  it('every week, up to and including the last date', () => {
    expect(occurrences('2026-11-01', 'weekly', '2026-11-29')).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'])
  })

  it('every two weeks', () => {
    expect(occurrences('2026-11-01', 'fortnightly', '2026-12-01')).toEqual(['2026-11-01', '2026-11-15', '2026-11-29'])
  })

  it('every month on the same date, the 31st landing on a short month’s last day', () => {
    expect(occurrences('2027-01-31', 'monthly_date', '2027-04-30')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  })

  it('every month on the same weekday of it: the first Sunday', () => {
    expect(occurrences('2026-11-01', 'monthly_weekday', '2027-02-28')).toEqual(['2026-11-01', '2026-12-06', '2027-01-03', '2027-02-07'])
  })

  it('the last Sunday stays the last, whatever the month', () => {
    expect(occurrences('2026-11-29', 'monthly_weekday', '2027-01-31')).toEqual(['2026-11-29', '2026-12-27', '2027-01-31'])
  })

  it('every year, 29 February falling back to the 28th', () => {
    expect(occurrences('2028-02-29', 'yearly', '2030-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28'])
  })

  it('never makes more than the cap', () => {
    expect(occurrences('2026-01-01', 'weekly', '2099-01-01')).toHaveLength(MAX_OCCURRENCES)
  })

  it('says the choices in words for the date chosen', () => {
    expect(repeatChoices('2026-11-01').map((c) => c.label)).toEqual([
      'Does not repeat',
      'Every week on Sunday',
      'Every 2 weeks on Sunday',
      'Every month on the first Sunday',
      'Every month on the 1st',
      'Every year on 1 Nov',
    ])
    expect(repeatWords('2026-11-01', 'weekly')).toBe('Repeats every week on Sunday')
    expect(repeatWords('2026-11-01', null)).toBeNull()
  })

  it('offers a sensible last date, and keeps a run of days its length', () => {
    expect(defaultUntil('2026-11-01', 'weekly')).toBe('2027-02-01')
    expect(defaultUntil('2026-11-01', 'monthly_date')).toBe('2027-11-01')
    expect(shiftRun('2026-11-06', '2026-11-08', '2026-11-13')).toEqual({ event_date: '2026-11-13', ends_on: '2026-11-15' })
    expect(shiftRun('2026-11-06', null, '2026-11-13')).toEqual({ event_date: '2026-11-13', ends_on: null })
  })
})
