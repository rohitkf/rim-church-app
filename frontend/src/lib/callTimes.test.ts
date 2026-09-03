import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALL_TIME,
  callMoment,
  callTimeFor,
  effectiveCallTime,
  myNextCallTime,
  orderTeamsForCallTimes,
  serviceDays,
  toClock,
  type CallTimeRow,
} from './callTimes'

const SUNDAY = '2026-09-06'

const team = (id: string, name: string) => ({ id, name })

const row = (department_id: string, call_time: string): CallTimeRow => ({
  department_id,
  on_date: SUNDAY,
  call_time,
})

const TEAMS = [team('media', 'Media'), team('ushers', 'Ushers'), team('worship', 'Worship')]

const ROWS = [row('media', '08:30:00'), row('worship', '08:00:00'), row('ushers', '09:15:00')]

const names = (teams: { name: string }[]) => teams.map((t) => t.name)

describe('toClock', () => {
  it('drops the seconds Postgres sends with a time', () => {
    expect(toClock('08:30:00')).toBe('08:30')
    expect(toClock('08:30')).toBe('08:30')
  })
})

describe('callTimeFor', () => {
  it('finds a team’s call time for the day', () => {
    expect(callTimeFor(ROWS, 'media')).toBe('08:30')
  })

  it('is null for a team nobody has set one for', () => {
    expect(callTimeFor(ROWS, 'nobody')).toBeNull()
  })
})

describe('the seven o’clock default', () => {
  it('gives a team nobody has set a real time, marked as the default', () => {
    expect(effectiveCallTime(ROWS, 'nobody', SUNDAY)).toEqual({
      clock: DEFAULT_CALL_TIME,
      at: callMoment(SUNDAY, DEFAULT_CALL_TIME),
      isDefault: true,
    })
  })

  it('gets out of the way the moment somebody sets one', () => {
    expect(effectiveCallTime(ROWS, 'media', SUNDAY).clock).toBe('08:30')
    expect(effectiveCallTime(ROWS, 'media', SUNDAY).isDefault).toBe(false)
  })

  it('keeps “we have not decided” and “we decided seven” apart', () => {
    const chosen = [row('media', `${DEFAULT_CALL_TIME}:00`)]
    expect(effectiveCallTime(chosen, 'media', SUNDAY).isDefault).toBe(false)
    expect(effectiveCallTime(chosen, 'ushers', SUNDAY).isDefault).toBe(true)
  })

  it('counts down to that hour on the service’s own morning, not today', () => {
    // A panel opened on Thursday about Sunday would otherwise count down to
    // a seven o'clock that has already been and gone.
    expect(callMoment(SUNDAY, '07:00')).toBe(new Date(`${SUNDAY}T07:00:00`).toISOString())
  })
})

describe('orderTeamsForCallTimes', () => {
  it('puts your own team first, whatever time it is called', () => {
    expect(names(orderTeamsForCallTimes(TEAMS, ROWS, new Set(['ushers']), SUNDAY))).toEqual([
      'Ushers',
      'Worship',
      'Media',
    ])
  })

  it('reads earliest first after that, which is the shape of a morning', () => {
    expect(names(orderTeamsForCallTimes(TEAMS, ROWS, new Set(), SUNDAY))).toEqual([
      'Worship',
      'Media',
      'Ushers',
    ])
  })

  it('sorts a team on the default at seven, not into an “unset” pile', () => {
    const rows = [row('media', '08:30:00')]
    expect(names(orderTeamsForCallTimes(TEAMS, rows, new Set(), SUNDAY))).toEqual([
      'Ushers',
      'Worship',
      'Media',
    ])
  })

  it('leaves the caller’s list alone, and keeps whatever else a team carries', () => {
    const original = [...TEAMS]
    orderTeamsForCallTimes(TEAMS, ROWS, new Set(['ushers']), SUNDAY)
    expect(TEAMS).toEqual(original)

    const withColour = [{ id: 'media', name: 'Media', color: '#ff0000' }]
    expect(orderTeamsForCallTimes(withColour, ROWS, new Set(), SUNDAY)[0].color).toBe('#ff0000')
  })
})

describe('myNextCallTime', () => {
  it('is the earliest of your own teams — the one that decides when you leave', () => {
    expect(myNextCallTime(ROWS, new Set(['media', 'ushers']), SUNDAY)?.clock).toBe('08:30')
  })

  it('falls back to seven for a team nobody has set', () => {
    expect(myNextCallTime(ROWS, new Set(['nobody']), SUNDAY)?.clock).toBe(DEFAULT_CALL_TIME)
  })

  it('is nothing for a head who runs a team but does not serve on one', () => {
    expect(myNextCallTime(ROWS, new Set(), SUNDAY)).toBeNull()
  })
})

describe('serviceDays', () => {
  const service = (id: string, date: string, service_type: string) => ({ id, date, service_type })

  it('gathers a day’s services together, because one call time covers them all', () => {
    // The case this exists for: an English service and a Malayalam service
    // on the same Sunday are one morning, and the team comes in once.
    const days = serviceDays([
      service('a', SUNDAY, 'English Service'),
      service('b', SUNDAY, 'Malayalam Service'),
      service('c', '2026-09-13', 'English Service'),
    ])
    expect(days).toHaveLength(2)
    expect(days[0].date).toBe(SUNDAY)
    expect(days[0].services.map((s) => s.service_type)).toEqual([
      'English Service',
      'Malayalam Service',
    ])
  })

  it('reads soonest first, whatever order the services arrived in', () => {
    const days = serviceDays([
      service('c', '2026-09-20', 'Later'),
      service('a', SUNDAY, 'Sooner'),
    ])
    expect(days.map((d) => d.date)).toEqual([SUNDAY, '2026-09-20'])
  })

  it('is empty when there is nothing on', () => {
    expect(serviceDays([])).toEqual([])
  })
})
