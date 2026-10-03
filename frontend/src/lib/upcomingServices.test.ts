import { describe, expect, it } from 'vitest'
import {
  inStartOrder,
  nextServiceDayAfter,
  opensOnItsOwn,
  upcomingServices,
  withNextDayOnceOver,
} from './upcomingServices'

const service = (id: string, date: string, service_type = 'Sunday Service') => ({
  id,
  date,
  service_type,
})

const TODAY = '2026-09-16'

describe('what the dashboard lists', () => {
  it('drops what has already happened and keeps what has not', () => {
    const listed = upcomingServices(
      [service('old', '2026-09-13'), service('next', '2026-09-20')],
      TODAY,
    )
    expect(listed.map((s) => s.id)).toEqual(['next'])
  })

  /*
   * A service that finished at eleven is still what somebody is asking
   * about at two. Dropping it at noon would leave the afternoon looking
   * like a day with nothing on it.
   */
  it('keeps today whatever the time is', () => {
    const listed = upcomingServices([service('this-morning', TODAY)], TODAY)
    expect(listed.map((s) => s.id)).toEqual(['this-morning'])
  })

  /*
   * Asked for by the church: on a Sunday with two services the page led
   * with today's pair and then next week's pair. Only the ones coming up.
   */
  it('lists every service on the nearest day and nothing after it', () => {
    const listed = upcomingServices(
      [
        service('next-first', '2026-09-27', 'First Service'),
        service('today-second', TODAY, 'Second Service'),
        service('today-first', TODAY, 'First Service'),
        service('next-second', '2026-09-27', 'Second Service'),
      ],
      TODAY,
    )
    expect(listed.map((s) => s.id)).toEqual(['today-first', 'today-second'])
  })

  it('is the next day with something on it when today has nothing', () => {
    const listed = upcomingServices(
      [service('c', '2026-10-04'), service('a', '2026-09-20'), service('b', '2026-09-27')],
      TODAY,
    )
    expect(listed.map((s) => s.id)).toEqual(['a'])
  })

  /*
   * A church that plans a quarter ahead and nothing in between should not
   * be told nothing is coming.
   */
  it('comes however far off that day is', () => {
    const listed = upcomingServices(
      [service('carols', '2026-12-25'), service('later-still', '2027-01-03')],
      TODAY,
    )
    expect(listed.map((s) => s.id)).toEqual(['carols'])
  })

  it('is empty when nothing is scheduled from today on', () => {
    expect(upcomingServices([service('old', '2026-09-13')], TODAY)).toEqual([])
  })
})

describe('the order two services on one morning are read in', () => {
  const morning = service('morning', '2026-09-20', 'First Service')
  const later = service('later', '2026-09-20', 'Second Service')
  const starts: Record<string, string> = {
    morning: '2026-09-20T08:30:00Z',
    later: '2026-09-20T10:30:00Z',
  }

  it('is the clock, not the name', () => {
    const ordered = inStartOrder([later, morning], (s) => starts[s.id] ?? null)
    expect(ordered.map((s) => s.id)).toEqual(['morning', 'later'])
  })

  it('leaves a service nobody has planned yet at the back of its own day', () => {
    const unplanned = service('unplanned', '2026-09-20', 'Afternoon Prayer')
    const ordered = inStartOrder([unplanned, later, morning], (s) => starts[s.id] ?? null)
    expect(ordered.map((s) => s.id)).toEqual(['morning', 'later', 'unplanned'])
  })

  it('never reorders across days, however early the later day starts', () => {
    const nextWeek = service('next-week', '2026-09-27', 'Dawn Prayer')
    const ordered = inStartOrder([nextWeek, later], (s) =>
      s.id === 'next-week' ? '2026-09-27T06:00:00Z' : starts[s.id] ?? null,
    )
    expect(ordered.map((s) => s.id)).toEqual(['later', 'next-week'])
  })
})

describe('which services arrive already open', () => {
  it('opens the ones happening today', () => {
    expect(opensOnItsOwn(TODAY, TODAY, 'upcoming')).toBe(true)
    expect(opensOnItsOwn(TODAY, TODAY, 'running')).toBe(true)
    expect(opensOnItsOwn(TODAY, TODAY, 'unplanned')).toBe(true)
  })

  it('leaves the rest of the week shut', () => {
    expect(opensOnItsOwn('2026-09-20', TODAY, 'upcoming')).toBe(false)
  })

  /*
   * A finished service is a record. Unfolded, it pushes the one still to
   * come off a phone screen, which is exactly backwards on the morning it
   * matters most.
   */
  it('leaves a service that is over shut, even on its own day', () => {
    expect(opensOnItsOwn(TODAY, TODAY, 'done')).toBe(false)
  })

  it('follows the day an Admin has stepped to rather than today', () => {
    expect(opensOnItsOwn('2026-09-20', '2026-09-20', 'upcoming')).toBe(true)
  })
})

describe('once today is over', () => {
  const todayFirst = service('today-first', TODAY, 'First Service')
  const todaySecond = service('today-second', TODAY, 'Second Service')
  const nextWeek = service('next-week', '2026-09-23')
  const listed = [todayFirst, todaySecond, ...nextServiceDayAfter([nextWeek, service('later', '2026-09-30')], TODAY)]

  it('finds the next service day after today, and only that one', () => {
    expect(listed.map((s) => s.id)).toEqual(['today-first', 'today-second', 'next-week'])
  })

  it('keeps to today while anything today is still to come', () => {
    const shown = withNextDayOnceOver(listed, TODAY, (s) => s.id === 'today-first')
    expect(shown.map((s) => s.id)).toEqual(['today-first', 'today-second'])
  })

  // The bug: both services finished by lunchtime, and Upcoming said
  // nothing was coming for the rest of the day while next Sunday was planned.
  it('brings the next service day in once every service today is over', () => {
    const shown = withNextDayOnceOver(listed, TODAY, (s) => s.date === TODAY)
    expect(shown.map((s) => s.id)).toEqual(['today-first', 'today-second', 'next-week'])
  })

  it('changes nothing when today has no services', () => {
    const ahead = [service('a', '2026-09-20')]
    expect(withNextDayOnceOver(ahead, TODAY, () => false)).toEqual(ahead)
  })
})

describe('the Dashboard’s own choices', () => {
  const svc = (id: string, date: string, service_type = 'English Service') => ({ id, date, service_type })

  it('lists the next few service days, not the next few dates', async () => {
    const { servicesOnNextDays } = await import('./upcomingServices')
    const all = [
      svc('a', '2026-10-04'),
      svc('b', '2026-10-04', 'Malayalam Service'),
      svc('c', '2026-10-11'),
      svc('d', '2026-10-18'),
      svc('old', '2026-09-27'),
    ]
    expect(servicesOnNextDays(all, '2026-10-03', 2).map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(servicesOnNextDays(all, '2026-10-03', 4).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('opens a card on its day, always or never as chosen — but never a finished one', async () => {
    const { opensByChoice } = await import('./upcomingServices')
    expect(opensByChoice('auto', '2026-10-04', '2026-10-04', 'upcoming')).toBe(true)
    expect(opensByChoice('auto', '2026-10-11', '2026-10-04', 'upcoming')).toBe(false)
    expect(opensByChoice('always', '2026-10-11', '2026-10-04', 'upcoming')).toBe(true)
    expect(opensByChoice('never', '2026-10-04', '2026-10-04', 'running')).toBe(false)
    expect(opensByChoice('always', '2026-10-04', '2026-10-04', 'done')).toBe(false)
  })
})
