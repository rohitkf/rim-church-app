import { describe, expect, it } from 'vitest'
import { buildDiary, byDay, diaryTime, eventIsOver, lastDayOf } from './churchDiary'

const TODAY = '2026-09-01'
const people = [
  { id: 'p1', first_name: 'Grace', last_name: 'Mensah', dob: '1990-09-04', anniversary: null },
  { id: 'p2', first_name: 'Tunde', last_name: 'Alabi', dob: null, anniversary: '2015-09-04' },
]
const services = [
  { id: 's1', date: '2026-09-06', service_type: 'English Service' },
  { id: 's0', date: '2026-08-30', service_type: 'Last week' },
]
const events = [
  {
    id: 'e1',
    title: 'Members meeting',
    event_date: '2026-09-10',
    start_time: '19:30:00',
    location: 'Main hall',
    details: null,
    department_id: null,
    created_by: 'p1',
    creator: { first_name: 'Grace', last_name: 'Mensah' },
    department: null,
  },
]

describe('buildDiary', () => {
  const diary = buildDiary({ people, services, events, today: TODAY })

  it('draws all four kinds into one list', () => {
    expect(diary.map((e) => e.kind).sort()).toEqual([
      'anniversary',
      'birthday',
      'event',
      'service',
    ])
  })

  it('puts them in date order', () => {
    expect(diary.map((e) => e.date)).toEqual(['2026-09-04', '2026-09-04', '2026-09-06', '2026-09-10'])
  })

  it('leaves what has already happened out of it', () => {
    expect(diary.some((e) => e.title === 'Last week')).toBe(false)
  })

  it('counts the years for a birthday and an anniversary', () => {
    expect(diary.find((e) => e.kind === 'birthday')?.detail).toBe('Turns 36')
    expect(diary.find((e) => e.kind === 'anniversary')?.detail).toBe('11 years')
  })

  it('says who added an event, and only for events', () => {
    expect(diary.find((e) => e.kind === 'event')?.addedBy).toBe('Grace Mensah')
    expect(diary.find((e) => e.kind === 'service')?.addedBy).toBeUndefined()
  })

  it('leaves a service its name, since the chip beside it says the rest', () => {
    expect(diary.find((e) => e.kind === 'service')?.detail).toBeNull()
  })

  it('gives a service somewhere to go and a birthday nowhere', () => {
    expect(diary.find((e) => e.kind === 'service')?.href).toBe('/service-planner/s1')
    expect(diary.find((e) => e.kind === 'birthday')?.href).toBeUndefined()
  })

  it('carries the time and place of an event on its second line', () => {
    expect(diary.find((e) => e.kind === 'event')?.detail).toBe('7:30pm · Main hall')
  })
})

describe('byDay', () => {
  it('gathers a day together, in date order', () => {
    const days = byDay(buildDiary({ people, services, events, today: TODAY }))
    expect(days.map(([date, list]) => [date, list.length])).toEqual([
      ['2026-09-04', 2],
      ['2026-09-06', 1],
      ['2026-09-10', 1],
    ])
  })
})

describe('diaryTime', () => {
  it('reads a stored time the way a person says it', () => {
    expect(diaryTime('19:30:00')).toBe('7:30pm')
    expect(diaryTime('09:00:00')).toBe('9:00am')
    expect(diaryTime('00:15:00')).toBe('12:15am')
    expect(diaryTime('12:00:00')).toBe('12:00pm')
  })

  it('has nothing to say about no time at all', () => {
    expect(diaryTime(null)).toBeNull()
    expect(diaryTime('')).toBeNull()
  })
})

describe('the year ahead, and no further', () => {
  const people = [{ id: 'p1', first_name: 'Ada', last_name: 'Bell', dob: '1990-03-04' }]

  it('keeps a service inside the year and drops one beyond it', () => {
    const diary = buildDiary({
      people: [],
      services: [
        { id: 'near', date: '2027-08-30', service_type: 'Sunday service' },
        { id: 'far', date: '2027-09-02', service_type: 'A year and a bit away' },
      ],
      events: [],
      today: '2026-09-01',
    })
    expect(diary.map((e) => e.title)).toEqual(['Sunday service'])
  })

  it('holds an event to the same horizon', () => {
    const event = (id: string, date: string) => ({
      id,
      title: id,
      event_date: date,
      start_time: null,
      location: null,
      details: null,
      department_id: null,
      created_by: null,
    })
    const diary = buildDiary({
      people: [],
      services: [],
      events: [event('inside', '2027-08-31'), event('outside', '2027-09-05')],
      today: '2026-09-01',
    })
    expect(diary.map((e) => e.title)).toEqual(['inside'])
  })

  it('lists a birthday once, not twice, inside the year', () => {
    // A 400-day window catches the same birthday in two different years,
    // which reads as a duplicate to everyone who is not a calendar.
    const diary = buildDiary({ people, services: [], events: [], today: '2026-09-01' })
    expect(diary.filter((e) => e.kind === 'birthday')).toHaveLength(1)
    expect(diary[0].date).toBe('2027-03-04')
  })
})

/*
 * A week of prayer is one event and seven answers to "what is on today".
 * It used to be either seven separate events with the same name, or one
 * event on the Monday with the rest of it written into the details — a
 * diary that cannot answer the question it exists for.
 */
describe('an event that runs over several days', () => {
  const run = [
    {
      id: 'e9',
      title: 'Week of prayer',
      event_date: '2026-09-14',
      ends_on: '2026-09-16',
      start_time: '19:00:00',
      location: 'Main hall',
      details: null,
      department_id: null,
      created_by: 'p1',
      creator: { first_name: 'Grace', last_name: 'Mensah' },
      department: null,
    },
  ]

  it('is in the diary on every day it covers', () => {
    const diary = buildDiary({ people: [], services: [], events: run, today: TODAY })
    expect(diary.map((e) => e.date)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16'])
  })

  it('says which day of itself each one is', () => {
    const diary = buildDiary({ people: [], services: [], events: run, today: TODAY })
    expect(diary.map((e) => e.span?.day)).toEqual([1, 2, 3])
    expect(diary.every((e) => e.span?.of === 3)).toBe(true)
    expect(diary[0].span?.from).toBe('2026-09-14')
    expect(diary[0].span?.to).toBe('2026-09-16')
  })

  // A start time belongs to the first day of a run. "7pm" on days two and
  // three is a time nobody said.
  it('carries the start time on the first day only', () => {
    const diary = buildDiary({ people: [], services: [], events: run, today: TODAY })
    expect(diary[0].detail).toContain('7:00pm')
    expect(diary[1].detail).not.toContain('7:00pm')
    expect(diary[1].detail).toContain('Main hall')
  })

  /*
   * The case a single date could never answer: it began before today and
   * has not finished, which is exactly when somebody asks.
   */
  it('is still on today when it started yesterday', () => {
    const diary = buildDiary({
      people: [],
      services: [],
      events: run,
      today: '2026-09-15',
    })
    expect(diary.map((e) => e.date)).toEqual(['2026-09-15', '2026-09-16'])
    // And it still knows it is on its second day, not its first.
    expect(diary[0].span?.day).toBe(2)
  })

  it('leaves a single-day event exactly as it was', () => {
    const diary = buildDiary({ people: [], services: [], events, today: TODAY })
    expect(diary).toHaveLength(1)
    expect(diary[0].id).toBe('event:e1')
    expect(diary[0].span ?? null).toBeNull()
  })
})

/*
 * What has already happened.
 *
 * A diary is for what is coming, so by default it drops what is over. But
 * an event is the only kind here that leaves no other record — a birthday
 * comes round again, a service has the planner — so the page that lists
 * them is also the only place they were ever written down, and dropping
 * them at midnight meant a members' meeting stopped existing the morning
 * after it.
 */
describe('events that are over', () => {
  const over = [
    {
      id: 'e5',
      title: 'Church workday',
      event_date: '2026-08-22',
      ends_on: null,
      start_time: '09:00:00',
      location: 'Car park',
      details: null,
      department_id: null,
      created_by: 'p1',
      creator: { first_name: 'Grace', last_name: 'Mensah' },
      department: null,
    },
  ]

  it('are left out unless they are asked for', () => {
    const diary = buildDiary({ people: [], services: [], events: over, today: TODAY })
    expect(diary).toEqual([])
  })

  it('come back when they are', () => {
    const diary = buildDiary({
      people: [],
      services: [],
      events: over,
      today: TODAY,
      includePast: true,
    })
    expect(diary.map((e) => e.title)).toEqual(['Church workday'])
    expect(diary[0].date).toBe('2026-08-22')
  })

  // The calendar dots days, so a finished run has to be on all of its own.
  it('bring every day of a finished run with them', () => {
    const diary = buildDiary({
      people: [],
      services: [],
      events: [{ ...over[0], ends_on: '2026-08-24' }],
      today: TODAY,
      includePast: true,
    })
    expect(diary.map((e) => e.date)).toEqual(['2026-08-22', '2026-08-23', '2026-08-24'])
    expect(diary.map((e) => e.span?.day)).toEqual([1, 2, 3])
  })

  /*
   * A run that began before today and has not finished is on today, and
   * asking for the past must not also hand back the days of it that have
   * gone — the same event would then be both coming up and over.
   */
  it('do not drag a run still going into the past with them', () => {
    const diary = buildDiary({
      people: [],
      services: [],
      events: [{ ...over[0], event_date: '2026-08-30', ends_on: '2026-09-03' }],
      today: TODAY,
      includePast: true,
    })
    // Every day of it, including the two behind us — but the event itself
    // is not over, so `eventIsOver` keeps it out of the past list.
    expect(eventIsOver({ ...over[0], event_date: '2026-08-30', ends_on: '2026-09-03' }, TODAY)).toBe(
      false,
    )
    expect(diary.some((e) => e.date === TODAY)).toBe(true)
  })

  it('knows the last day of a run is the day it is judged by', () => {
    expect(lastDayOf({ ...over[0], ends_on: '2026-08-24' })).toBe('2026-08-24')
    expect(lastDayOf(over[0])).toBe('2026-08-22')
    // An end before the start is nonsense somebody typed, not a run.
    expect(lastDayOf({ ...over[0], ends_on: '2026-08-01' })).toBe('2026-08-22')
  })

  it('counts today as not yet over', () => {
    expect(eventIsOver({ ...over[0], event_date: TODAY }, TODAY)).toBe(false)
    expect(eventIsOver(over[0], TODAY)).toBe(true)
  })

  it('still stops at the horizon ahead, whatever it does behind', () => {
    const diary = buildDiary({
      people: [],
      services: [],
      events: [{ ...over[0], event_date: '2027-10-01' }],
      today: TODAY,
      includePast: true,
    })
    expect(diary).toEqual([])
  })
})
