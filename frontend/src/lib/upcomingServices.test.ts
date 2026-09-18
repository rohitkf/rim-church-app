import { describe, expect, it } from 'vitest'
import { inStartOrder, opensOnItsOwn, upcomingServices } from './upcomingServices'

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

  it('reads in the order the weeks happen', () => {
    const listed = upcomingServices(
      [service('c', '2026-10-04'), service('a', '2026-09-20'), service('b', '2026-09-27')],
      TODAY,
    )
    expect(listed.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('stops at the horizon, because a rota that far out is a guess', () => {
    const listed = upcomingServices(
      [service('soon', '2026-09-20'), service('miles-away', '2026-12-25')],
      TODAY,
    )
    expect(listed.map((s) => s.id)).toEqual(['soon'])
  })

  /*
   * A church that plans a quarter ahead and nothing in between should not
   * be told nothing is coming.
   */
  it('shows the next one anyway when the window is empty', () => {
    const listed = upcomingServices(
      [service('carols', '2026-12-25'), service('later-still', '2027-01-03')],
      TODAY,
    )
    expect(listed.map((s) => s.id)).toEqual(['carols'])
  })

  it('does not run past the end of a page', () => {
    const many = Array.from({ length: 20 }, (_, i) => service(`s${i}`, '2026-09-20'))
    expect(upcomingServices(many, TODAY)).toHaveLength(8)
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
