import { describe, expect, it } from 'vitest'
import { checkInCounts, checkInDayName, checkInDays, checkInsOf, everCheckedIn, shortDay } from './checkInDays'

const fri = { on_date: '2026-11-20', checked_in_at: '2026-11-20T18:15:00Z' }
const sat = { on_date: '2026-11-21', checked_in_at: '2026-11-21T10:02:00Z' }
const orders = [
  { name: 'Both days', quantity: 2, checked_in_at: sat.checked_in_at, check_ins: [sat, fri] },
  { name: 'Friday only', quantity: 1, checked_in_at: fri.checked_in_at, check_ins: [fri] },
  { name: 'Saturday only', quantity: 3, checked_in_at: sat.checked_in_at, check_ins: [sat] },
  { name: 'Never came', quantity: 1, checked_in_at: null, check_ins: [] },
  { name: 'An older row, with nothing kept', quantity: 1, checked_in_at: null },
]

describe('who came on which day', () => {
  it('lists the days there were check-ins on, the first first', () => {
    expect(checkInDays(orders)).toEqual(['2026-11-20', '2026-11-21'])
    expect(checkInDays([])).toEqual([])
  })

  it('gives one registration’s own, the first day first', () => {
    expect(checkInsOf(orders[0]).map((c) => c.on_date)).toEqual(['2026-11-20', '2026-11-21'])
    expect(checkInsOf(orders[4])).toEqual([])
  })

  it('counts each day’s registrations and the people on them', () => {
    expect(checkInCounts(orders)).toEqual([
      { day: '2026-11-20', registrations: 2, people: 3 },
      { day: '2026-11-21', registrations: 2, people: 5 },
    ])
  })

  it('calls a day by the event’s own name for it, and by the day itself where it has none', () => {
    const dates = [
      { starts_at: '2026-11-20T18:30:00', label: 'Day 1' },
      { starts_at: '2026-11-21T10:00:00', label: null },
    ]
    expect(checkInDayName('2026-11-20', dates, 'en-GB')).toBe('Day 1')
    expect(checkInDayName('2026-11-21', dates, 'en-GB')).toBe('Sat 21 Nov')
    // A day the event has no date on: somebody checked in the evening before.
    expect(checkInDayName('2026-11-19', dates, 'en-GB')).toBe('Thu 19 Nov')
    expect(shortDay('2026-11-20', 'en-GB')).toBe('Fri 20 Nov')
  })

  it('knows somebody came if any day is kept, even after today’s check-in was undone', () => {
    expect(everCheckedIn({ checked_in_at: null, check_ins: [fri] })).toBe(true)
    expect(everCheckedIn({ checked_in_at: fri.checked_in_at })).toBe(true)
    expect(everCheckedIn({ checked_in_at: null, check_ins: [] })).toBe(false)
    expect(everCheckedIn({ checked_in_at: null })).toBe(false)
  })
})
