import { describe, expect, it } from 'vitest'
import { callMoment } from './callTimes'
import { myCallTime, relativeDay } from './myCallTimes'

const teams = [
  { id: 'sound', name: 'Sound', color: '#06c' },
  { id: 'worship', name: 'Worship', color: null },
  { id: 'kids', name: 'Kids', color: null },
]
const services = [
  { id: 's-eng', date: '2026-11-22', service_type: 'English Service' },
  { id: 's-mal', date: '2026-11-22', service_type: 'Malayalam Service' },
  { id: 's-wed', date: '2026-11-25', service_type: 'Midweek' },
  { id: 's-next', date: '2026-11-29', service_type: 'English Service' },
  { id: 's-gone', date: '2026-11-15', service_type: 'English Service' },
]
const rows = [
  { department_id: 'sound', on_date: '2026-11-22', call_time: '06:30:00' },
  { department_id: 'kids', on_date: '2026-11-22', call_time: '08:15:00' },
  { department_id: 'sound', on_date: '2026-11-29', call_time: '07:45:00' },
]
// Friday evening, two days before the Sunday.
const friday = new Date('2026-11-20T18:00:00').getTime()
const ask = (over: Partial<Parameters<typeof myCallTime>[0]> = {}) =>
  myCallTime({ services, rows, teams, mine: ['sound', 'worship'], onRota: null, today: '2026-11-20', now: friday, days: 7, stayMinutes: 0, ...over })
/** "2026-11-22: 06:30 Sound; 07:00 Worship" — or null. */
const shape = (day: ReturnType<typeof myCallTime>) =>
  day && `${day.date}: ${day.calls.map((c) => `${c.clock} ${c.teams.map((t) => t.name).join(' + ')}`).join('; ')}`
const on = (date: string, clock: string) => ({ today: date, now: new Date(`${date}T${clock}:00`).getTime() })

describe('my call time, for the Dashboard', () => {
  it('is the next service day’s, and only that day’s', () => {
    // Wednesday and the Sunday after are in the week ahead too, and are not mentioned.
    expect(shape(ask())).toBe('2026-11-22: 06:30 Sound; 07:00 Worship')
  })

  it('is today’s, when there is a service today', () => {
    expect(shape(ask(on('2026-11-22', '05:00')))).toBe('2026-11-22: 06:30 Sound; 07:00 Worship')
  })

  it('moves on to the next service day once this one is over', () => {
    expect(shape(ask(on('2026-11-23', '09:00')))).toBe('2026-11-25: 07:00 Sound + Worship')
    expect(shape(ask(on('2026-11-26', '09:00')))).toBe('2026-11-29: 07:00 Worship; 07:45 Sound')
  })

  it('names the day’s services once, however many there are', () => {
    expect(ask()!.services.map((s) => s.service_type)).toEqual(['English Service', 'Malayalam Service'])
  })

  it('says a time once for teams called together, with each team beside it', () => {
    const wednesday = ask(on('2026-11-24', '12:00'))!
    expect(wednesday.calls).toHaveLength(1)
    expect(wednesday.calls[0]).toMatchObject({ clock: '07:00', at: callMoment('2026-11-25', '07:00') })
    expect(wednesday.calls[0].teams.map((t) => t.name)).toEqual(['Sound', 'Worship'])
  })

  it('leaves out teams that are not mine', () => {
    expect(shape(ask())).not.toContain('Kids')
  })

  it('looks only as far ahead as the church set — 0 is the day itself', () => {
    expect(ask({ days: 1 })).toBeNull()
    expect(shape(ask({ days: 2 }))).toBe('2026-11-22: 06:30 Sound; 07:00 Worship')
    expect(ask({ days: 0 })).toBeNull()
    expect(shape(ask({ days: 0, ...on('2026-11-22', '05:00') }))).toBe('2026-11-22: 06:30 Sound; 07:00 Worship')
  })

  describe('goes once the call time is reached', () => {
    const sunday = (clock: string, stayMinutes = 0) => shape(ask({ ...on('2026-11-22', clock), stayMinutes }))

    it('is there a minute before', () => {
      expect(sunday('06:29')).toBe('2026-11-22: 06:30 Sound; 07:00 Worship')
    })

    it('drops a team at its own call time, and keeps the one still to come', () => {
      expect(sunday('06:30')).toBe('2026-11-22: 07:00 Worship')
    })

    it('says nothing once the last has passed — not next week’s in its place', () => {
      expect(sunday('07:00')).toBeNull()
      // The following Sunday is inside the week ahead, and still is not shown today.
      expect(sunday('14:00')).toBeNull()
      expect(sunday('23:59')).toBeNull()
    })

    it('stays as long after the call time as the church set', () => {
      expect(sunday('06:44', 15)).toBe('2026-11-22: 06:30 Sound; 07:00 Worship')
      expect(sunday('06:45', 15)).toBe('2026-11-22: 07:00 Worship')
      expect(sunday('07:15', 15)).toBeNull()
    })

    it('drops teams called together, together', () => {
      const wed = (clock: string) => shape(ask(on('2026-11-25', clock)))
      expect(wed('06:59')).toBe('2026-11-25: 07:00 Sound + Worship')
      expect(wed('07:00')).toBeNull()
    })
  })

  describe('for whoever the rota put on, when the church asks for that', () => {
    it('is the next day I am serving, on the team I was put on', () => {
      expect(shape(ask({ onRota: new Set(['s-mal:sound', 's-wed:worship']) }))).toBe('2026-11-22: 06:30 Sound')
    })

    it('passes over a service day I am not on for the next one I am', () => {
      expect(shape(ask({ onRota: new Set(['s-wed:worship']) }))).toBe('2026-11-25: 07:00 Worship')
    })

    it('shows nothing to somebody the rota has not put on', () => {
      expect(ask({ onRota: new Set() })).toBeNull()
    })

    it('counts a place on a team I am not otherwise on', () => {
      expect(shape(ask({ mine: [], onRota: new Set(['s-eng:kids']) }))).toBe('2026-11-22: 08:15 Kids')
    })
  })

  it('has nothing to say to somebody on no team, or about a team it cannot see', () => {
    expect(ask({ mine: [] })).toBeNull()
    expect(ask({ mine: ['gone'] })).toBeNull()
  })
})

describe('the day, as somebody would say it', () => {
  it('says Today and Tomorrow, and otherwise names the day', () => {
    expect(relativeDay('2026-11-20', '2026-11-20')).toBe('Today')
    expect(relativeDay('2026-11-21', '2026-11-20')).toBe('Tomorrow')
    expect(relativeDay('2026-11-22', '2026-11-20')).toMatch(/Sun/)
  })
})
