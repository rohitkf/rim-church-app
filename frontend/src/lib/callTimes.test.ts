import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALL_TIME,
  callTimeFor,
  defaultCallTimeOn,
  effectiveCallTime,
  myNextCallTime,
  orderTeamsForCallTimes,
  type CallTimeRow,
} from './callTimes'

const SUNDAY = '2026-09-06'

const team = (id: string, name: string) => ({ id, name })

/** A call time on the service's own morning, written as the input would. */
const at = (hhmm: string): string => new Date(`${SUNDAY}T${hhmm}:00`).toISOString()

const row = (department_id: string, hhmm: string): CallTimeRow => ({
  department_id,
  service_id: 's1',
  call_time: at(hhmm),
})

const TEAMS = [team('media', 'Media'), team('ushers', 'Ushers'), team('worship', 'Worship')]

const ROWS = [row('media', '08:30'), row('worship', '08:00'), row('ushers', '09:15')]

const names = (teams: { name: string }[]) => teams.map((t) => t.name)

describe('callTimeFor', () => {
  it('finds a team’s call time', () => {
    expect(callTimeFor(ROWS, 'media')).toBe(at('08:30'))
  })

  it('is null for a team nobody has set one for', () => {
    expect(callTimeFor(ROWS, 'nobody')).toBeNull()
  })
})

describe('the seven o’clock default', () => {
  it('lands on the service’s own morning, not on today', () => {
    // A panel opened on Thursday about Sunday would otherwise count down
    // to a seven o'clock that has already been and gone.
    expect(defaultCallTimeOn(SUNDAY)).toBe(at(DEFAULT_CALL_TIME))
  })

  it('gives a team nobody has set a real time, marked as the default', () => {
    expect(effectiveCallTime(ROWS, 'nobody', SUNDAY)).toEqual({
      at: at(DEFAULT_CALL_TIME),
      isDefault: true,
    })
  })

  it('gets out of the way the moment somebody sets one', () => {
    expect(effectiveCallTime(ROWS, 'media', SUNDAY)).toEqual({
      at: at('08:30'),
      isDefault: false,
    })
  })

  it('keeps “we have not decided” and “we decided seven” apart', () => {
    // Both are seven o'clock; only one of them was chosen, and the panel
    // says which.
    const chosen = [row('media', DEFAULT_CALL_TIME)]
    expect(effectiveCallTime(chosen, 'media', SUNDAY).isDefault).toBe(false)
    expect(effectiveCallTime(chosen, 'ushers', SUNDAY).isDefault).toBe(true)
  })
})

describe('orderTeamsForCallTimes', () => {
  it('puts your own team first, whatever time it is called', () => {
    // Ushers are called last and read first: you opened this to find out
    // when you are due.
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
    // Having a default means there is no such pile: a team nobody has set
    // is due at seven and is in first.
    const rows = [row('media', '08:30')]
    expect(names(orderTeamsForCallTimes(TEAMS, rows, new Set(), SUNDAY))).toEqual([
      'Ushers',
      'Worship',
      'Media',
    ])
  })

  it('orders your own teams among themselves by time too', () => {
    expect(
      names(orderTeamsForCallTimes(TEAMS, ROWS, new Set(['media', 'ushers']), SUNDAY)),
    ).toEqual(['Media', 'Ushers', 'Worship'])
  })

  it('leaves the caller’s list alone', () => {
    const original = [...TEAMS]
    orderTeamsForCallTimes(TEAMS, ROWS, new Set(['ushers']), SUNDAY)
    expect(TEAMS).toEqual(original)
  })

  it('keeps whatever else a team is carrying', () => {
    const withColour = [{ id: 'media', name: 'Media', color: '#ff0000' }]
    expect(orderTeamsForCallTimes(withColour, ROWS, new Set(), SUNDAY)[0].color).toBe('#ff0000')
  })
})

describe('myNextCallTime', () => {
  it('is the earliest of your own teams — the one that decides when you leave', () => {
    expect(myNextCallTime(ROWS, new Set(['media', 'ushers']), SUNDAY)?.at).toBe(at('08:30'))
  })

  it('falls back to seven for a team nobody has set', () => {
    expect(myNextCallTime(ROWS, new Set(['nobody']), SUNDAY)).toEqual({
      at: at(DEFAULT_CALL_TIME),
      isDefault: true,
    })
  })

  it('is nothing for a head who runs a team but does not serve on one', () => {
    expect(myNextCallTime(ROWS, new Set(), SUNDAY)).toBeNull()
  })
})
