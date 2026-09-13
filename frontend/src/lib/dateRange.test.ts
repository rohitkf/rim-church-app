import { describe, expect, it } from 'vitest'
import { addDays, dayCount, daysBetween, formatRange, isWithin } from './dateRange'

const TODAY = '2026-09-13'

describe('days, as the calendar counts them', () => {
  it('counts both ends of a run', () => {
    expect(dayCount('2026-09-18', '2026-09-18')).toBe(1)
    expect(dayCount('2026-09-18', '2026-09-20')).toBe(3)
  })

  it('gives every day in between', () => {
    expect(daysBetween('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
  })

  /*
   * The reason none of this touches a Date: an event on the 14th is on the
   * 14th everywhere, and the clocks going back must not move it.
   */
  it('steps across a month, a year and a clock change without slipping a day', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26') // BST ends on the 25th
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('knows what falls inside a run', () => {
    expect(isWithin('2026-09-19', '2026-09-18', '2026-09-20')).toBe(true)
    expect(isWithin('2026-09-21', '2026-09-18', '2026-09-20')).toBe(false)
  })
})

describe('a run, written the way somebody says it', () => {
  it('says a single day once', () => {
    expect(formatRange('2026-09-18', null, TODAY)).toBe('18 Sep')
  })

  it('says the month once when both ends share it', () => {
    expect(formatRange('2026-09-18', '2026-09-20', TODAY)).toBe('18–20 Sep')
  })

  it('says both months when it crosses one', () => {
    expect(formatRange('2026-09-29', '2026-10-02', TODAY)).toBe('29 Sep – 2 Oct')
  })

  // The year is noise until it isn't: everything in a diary is this year
  // until somebody plans next Christmas.
  it('adds the year only when it is not this one', () => {
    expect(formatRange('2027-01-02', '2027-01-04', TODAY)).toBe('2–4 Jan 2027')
  })

  it('treats an end equal to the start as a single day', () => {
    expect(formatRange('2026-09-18', '2026-09-18', TODAY)).toBe('18 Sep')
  })
})
