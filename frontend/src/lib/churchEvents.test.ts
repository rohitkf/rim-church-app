import { describe, expect, it } from 'vitest'
import { eventsOnDay } from './churchEvents'
import type { DiaryEvent } from './churchDiary'

const TODAY = '2026-09-16'

const event = (over: Partial<DiaryEvent> & { id: string; event_date: string }): DiaryEvent => ({
  title: 'Something',
  ends_on: null,
  start_time: null,
  location: null,
  details: null,
  department_id: null,
  created_by: null,
  creator: null,
  department: null,
  ...over,
})

describe('what is on today', () => {
  it('takes today and leaves the rest of the diary alone', () => {
    const today = eventsOnDay(
      [
        event({ id: 'yesterday', event_date: '2026-09-15' }),
        event({ id: 'today', event_date: TODAY }),
        event({ id: 'tomorrow', event_date: '2026-09-17' }),
      ],
      TODAY,
    )
    expect(today.map((e) => e.id)).toEqual(['today'])
  })

  /*
   * A week of prayer is one row in the table and seven answers to "what is
   * on today". The Wednesday of it is on, even though it started Monday.
   */
  it('counts a run as on for every day it covers', () => {
    const [on] = eventsOnDay(
      [event({ id: 'week', event_date: '2026-09-14', ends_on: '2026-09-20' })],
      TODAY,
    )
    expect(on.id).toBe('week')
    expect(on.day).toEqual({ nth: 3, of: 7 })
  })

  it('says nothing about days for a run that ended yesterday', () => {
    expect(
      eventsOnDay([event({ id: 'over', event_date: '2026-09-10', ends_on: '2026-09-15' })], TODAY),
    ).toEqual([])
  })

  it('leaves a single day without a day count, because "day 1 of 1" is noise', () => {
    const [on] = eventsOnDay([event({ id: 'one', event_date: TODAY })], TODAY)
    expect(on.day).toBeNull()
  })

  it('says the hour in the words a person would use', () => {
    const [on] = eventsOnDay(
      [event({ id: 'evening', event_date: TODAY, start_time: '19:30:00' })],
      TODAY,
    )
    expect(on.time).toBe('7:30pm')
  })

  /*
   * The hour belongs to the first day of a run: "7pm" on day three of a
   * conference is a time nobody ever said.
   */
  it('drops the start time on the later days of a run', () => {
    const [on] = eventsOnDay(
      [
        event({
          id: 'conference',
          event_date: '2026-09-15',
          ends_on: '2026-09-17',
          start_time: '19:00:00',
        }),
      ],
      TODAY,
    )
    expect(on.time).toBeNull()
  })

  it('keeps the start time on the first day of one', () => {
    const [on] = eventsOnDay(
      [
        event({
          id: 'conference',
          event_date: TODAY,
          ends_on: '2026-09-18',
          start_time: '19:00:00',
        }),
      ],
      TODAY,
    )
    expect(on.time).toBe('7:00pm')
  })

  it('carries the team and its colour through', () => {
    const [on] = eventsOnDay(
      [
        event({
          id: 'rehearsal',
          event_date: TODAY,
          location: 'Main hall',
          department: { name: 'Worship', color: '#ff0000' },
        }),
      ],
      TODAY,
    )
    expect(on.team).toBe('Worship')
    expect(on.color).toBe('#ff0000')
    expect(on.location).toBe('Main hall')
  })
})

describe('the order the day reads in', () => {
  /*
   * Sorted on "09:00:00" rather than on "9:00am", which as text puts ten
   * in the morning before nine.
   */
  it('is the clock, not the spelling of the clock', () => {
    const on = eventsOnDay(
      [
        event({ id: 'ten', event_date: TODAY, start_time: '10:30:00' }),
        event({ id: 'nine', event_date: TODAY, start_time: '09:00:00' }),
      ],
      TODAY,
    )
    expect(on.map((e) => e.id)).toEqual(['nine', 'ten'])
  })

  it('puts whatever has no hour after everything that has one', () => {
    const on = eventsOnDay(
      [
        event({ id: 'whenever', event_date: TODAY, title: 'Aardvark day' }),
        event({ id: 'seven', event_date: TODAY, start_time: '19:00:00' }),
      ],
      TODAY,
    )
    expect(on.map((e) => e.id)).toEqual(['seven', 'whenever'])
  })

  it('falls back to the title when two things start together', () => {
    const on = eventsOnDay(
      [
        event({ id: 'b', event_date: TODAY, title: 'Bible study', start_time: '19:00:00' }),
        event({ id: 'a', event_date: TODAY, title: 'Après-service tea', start_time: '19:00:00' }),
      ],
      TODAY,
    )
    expect(on.map((e) => e.id)).toEqual(['a', 'b'])
  })
})
