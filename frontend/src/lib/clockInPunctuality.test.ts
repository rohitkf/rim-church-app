import { describe, expect, it } from 'vitest'
import {
  CHART_EARLY_MIN,
  CHART_LATE_MIN,
  againstCallWords,
  barExtent,
  isLate,
  median,
  minutesAfterCall,
  punctualityByPerson,
  recordWords,
  sortForDay,
  spanWords,
  typicalWords,
  windowStart,
  windowWords,
} from './clockInPunctuality'

/*
 * Each clock-in held against the call time it was for (0280): how long
 * after, whether that is late, and what a person's weeks add up to.
 */

const at = (hhmm: string, day = '2026-11-08') => `${day}T${hhmm}:00Z`
const row = (id: string, clocked: string, call: string | null, day = '2026-11-08') => ({
  id,
  clocked_at: at(clocked, day),
  call_at: call === null ? null : at(call, day),
})

describe('how long after the call', () => {
  it('is whole minutes, negative before it', () => {
    expect(minutesAfterCall(row('a', '08:47', '08:00'))).toBe(47)
    expect(minutesAfterCall(row('a', '07:48', '08:00'))).toBe(-12)
    expect(minutesAfterCall(row('a', '08:00', '08:00'))).toBe(0)
  })

  it('is not known without a call time, however it is missing', () => {
    expect(minutesAfterCall(row('a', '08:47', null))).toBeNull()
    expect(minutesAfterCall({ clocked_at: at('08:47') })).toBeNull()
    expect(minutesAfterCall({ clocked_at: at('08:47'), call_at: 'not a time' })).toBeNull()
  })
})

describe('late', () => {
  it('is the church’s number of minutes after the call, or more', () => {
    expect(isLate(row('a', '08:30', '08:00'), 30)).toBe(true)
    expect(isLate(row('a', '08:29', '08:00'), 30)).toBe(false)
    expect(isLate(row('a', '09:15', '08:00'), 30)).toBe(true)
  })

  it('moves with the setting', () => {
    expect(isLate(row('a', '08:20', '08:00'), 15)).toBe(true)
    expect(isLate(row('a', '08:40', '08:00'), 45)).toBe(false)
  })

  it('is never somebody whose call time is not known, nor somebody early', () => {
    expect(isLate(row('a', '11:00', null), 30)).toBe(false)
    expect(isLate(row('a', '06:00', '08:00'), 30)).toBe(false)
  })
})

describe('the day’s list', () => {
  it('puts whoever is late first, the latest at the top, then everybody else as they arrived', () => {
    const rows = [
      row('early', '07:50', '08:00'),
      row('late-35', '08:35', '08:00'),
      row('fine', '08:10', '08:00'),
      row('late-90', '09:30', '08:00'),
      row('unknown', '07:00', null),
      row('late-31', '08:31', '08:00'),
    ]
    expect(sortForDay(rows, 30).map((r) => r.id)).toEqual(['late-90', 'late-35', 'late-31', 'unknown', 'early', 'fine'])
  })

  it('is by how late, not by the clock: a later call time can make a later arrival the less late', () => {
    const rows = [row('ten-to-ten', '09:50', '09:15'), row('nine', '09:00', '08:00')]
    expect(sortForDay(rows, 30).map((r) => r.id)).toEqual(['nine', 'ten-to-ten'])
  })

  it('is as they arrived when nobody is late, and changes nothing it was given', () => {
    const rows = [row('b', '08:10', '08:00'), row('a', '07:50', '08:00')]
    expect(sortForDay(rows, 30).map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('the words', () => {
  it('say a length of time', () => {
    expect(spanWords(45)).toBe('45 min')
    expect(spanWords(60)).toBe('1 h')
    expect(spanWords(130)).toBe('2 h 10 min')
    expect(spanWords(-12)).toBe('12 min')
  })

  it('say where a clock-in fell against its call', () => {
    expect(againstCallWords(47)).toBe('47 min after call')
    expect(againstCallWords(-12)).toBe('12 min before call')
    expect(againstCallWords(0)).toBe('At call time')
    expect(againstCallWords(null)).toBe('Call time not known')
  })

  it('say a person’s record', () => {
    expect(recordWords({ count: 6, known: 6, late: 1 })).toBe('1 late of 6')
    expect(recordWords({ count: 6, known: 6, late: 0 })).toBe('On time, all 6 clock-ins')
    expect(recordWords({ count: 1, known: 1, late: 0 })).toBe('On time, 1 clock-in')
    expect(recordWords({ count: 3, known: 0, late: 0 })).toBe('3 clock-ins')
    expect(recordWords({ count: 1, known: 0, late: 0 })).toBe('1 clock-in')
  })

  it('say what is usual for them', () => {
    expect(typicalWords(-12)).toBe('Usually 12 min before call')
    expect(typicalWords(8)).toBe('Usually 8 min after call')
    expect(typicalWords(0)).toBe('Usually at call time')
    expect(typicalWords(null)).toBeNull()
  })

  it('say the window as somebody would: weeks where it is whole weeks', () => {
    expect(windowWords(28)).toBe('4 weeks')
    expect(windowWords(7)).toBe('week')
    expect(windowWords(30)).toBe('30 days')
    expect(windowWords(1)).toBe('day')
  })
})

describe('the window', () => {
  it('starts the days kept before today, as the nightly clear counts them', () => {
    expect(windowStart('2026-11-11', 28)).toBe('2026-10-14')
    expect(windowStart('2026-03-05', 7)).toBe('2026-02-26')
    expect(windowStart('2026-01-10', 30)).toBe('2025-12-11')
  })
})

describe('the middle arrival', () => {
  it('is not moved by one freak morning', () => {
    expect(median([-5, -3, 2, 4, 250])).toBe(2)
    expect(median([-10, 20])).toBe(5)
    expect(median([7])).toBe(7)
    expect(median([])).toBeNull()
  })
})

describe('everybody’s record', () => {
  const rows = [
    { user_id: 'ann', on_date: '2026-11-01', clocked_at: at('08:50', '2026-11-01'), call_at: at('08:00', '2026-11-01'), person: { first_name: 'Ann', last_name: 'Bee' } },
    { user_id: 'ann', on_date: '2026-10-25', clocked_at: at('07:55', '2026-10-25'), call_at: at('08:00', '2026-10-25'), person: { first_name: 'Ann', last_name: 'Bee' } },
    { user_id: 'ann', on_date: '2026-11-08', clocked_at: at('08:40', '2026-11-08'), call_at: at('08:00', '2026-11-08'), person: { first_name: 'Ann', last_name: 'Bee' } },
    { user_id: 'cal', on_date: '2026-11-08', clocked_at: at('07:45', '2026-11-08'), call_at: at('08:00', '2026-11-08'), person: { first_name: 'Cal', last_name: 'Dee' } },
    { user_id: 'bob', on_date: '2026-11-08', clocked_at: at('08:31', '2026-11-08'), call_at: at('08:00', '2026-11-08'), person: { first_name: 'Bob', last_name: 'Cee' } },
    { user_id: 'bob', on_date: '2026-11-01', clocked_at: at('10:00', '2026-11-01'), call_at: null, person: { first_name: 'Bob', last_name: 'Cee' } },
    { user_id: 'abe', on_date: '2026-11-08', clocked_at: at('07:59', '2026-11-08'), call_at: at('08:00', '2026-11-08'), person: null },
  ]
  const people = punctualityByPerson(rows, 30)

  it('lists whoever is late most often first, then by name', () => {
    expect(people.map((p) => [p.name, p.late])).toEqual([
      ['Ann Bee', 2],
      ['Bob Cee', 1],
      ['Cal Dee', 0],
      ['Somebody', 0],
    ])
  })

  it('keeps each person’s arrivals oldest first, with how long after the call and whether late', () => {
    const ann = people[0]
    expect(ann.arrivals.map((a) => [a.on_date, a.minutes, a.late])).toEqual([
      ['2026-10-25', -5, false],
      ['2026-11-01', 50, true],
      ['2026-11-08', 40, true],
    ])
    expect(ann.count).toBe(3)
    expect(ann.typical).toBe(40)
  })

  it('counts a clock-in with no call time as a clock-in, and leaves it out of the sums', () => {
    const bob = people[1]
    expect(bob.count).toBe(2)
    expect(bob.known).toBe(1)
    expect(bob.late).toBe(1)
    expect(bob.typical).toBe(31)
    expect(bob.arrivals[0]).toMatchObject({ on_date: '2026-11-01', minutes: null, late: false })
  })

  it('moves with the church’s number', () => {
    expect(punctualityByPerson(rows, 45).map((p) => [p.name, p.late])[0]).toEqual(['Ann Bee', 1])
    expect(punctualityByPerson(rows, 60).every((p) => p.late === 0)).toBe(true)
  })

  it('is nobody when nothing is kept', () => {
    expect(punctualityByPerson([], 30)).toEqual([])
  })
})

describe('where a bar ends', () => {
  const span = CHART_EARLY_MIN + CHART_LATE_MIN

  it('grows up from the call line after it and down before it, in proportion', () => {
    expect(barExtent(60)).toEqual({ share: 60 / span, over: false })
    expect(barExtent(-30)).toEqual({ share: -30 / span, over: false })
    expect(barExtent(0)).toEqual({ share: 0, over: false })
  })

  it('stops at the edge of the scale and says it was cut short', () => {
    expect(barExtent(260)).toEqual({ share: CHART_LATE_MIN / span, over: true })
    expect(barExtent(-95)).toEqual({ share: -CHART_EARLY_MIN / span, over: true })
    expect(barExtent(CHART_LATE_MIN).over).toBe(false)
    expect(barExtent(-CHART_EARLY_MIN).over).toBe(false)
  })
})
