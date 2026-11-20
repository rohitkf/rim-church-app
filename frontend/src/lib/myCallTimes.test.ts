import { describe, expect, it } from 'vitest'
import { callMoment } from './callTimes'
import { myCallTimes, relativeDay } from './myCallTimes'

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
const ask = (over: Partial<Parameters<typeof myCallTimes>[0]> = {}) =>
  myCallTimes({ services, rows, teams, mine: ['sound', 'worship'], onRota: null, today: '2026-11-20', now: friday, days: 7, stayMinutes: 0, ...over })
const shape = (days: ReturnType<typeof myCallTimes>) => days.map((d) => `${d.date}: ${d.teams.map((t) => `${t.name} ${t.clock}`).join(', ')}`)

describe('my call times, for the Dashboard', () => {
  it('lists each service day in the window with my teams, earliest call first', () => {
    expect(shape(ask())).toEqual(['2026-11-22: Sound 06:30, Worship 07:00', '2026-11-25: Sound 07:00, Worship 07:00'])
  })

  it('names the day’s services once, however many there are', () => {
    expect(ask()[0].services.map((s) => s.service_type)).toEqual(['English Service', 'Malayalam Service'])
  })

  it('says which times nobody set', () => {
    const [sunday] = ask()
    expect(sunday.teams.map((t) => t.isDefault)).toEqual([false, true])
  })

  it('leaves out teams that are not mine, and days already gone', () => {
    const all = ask().flatMap((d) => d.teams.map((t) => t.name))
    expect(all).not.toContain('Kids')
    expect(ask().map((d) => d.date)).not.toContain('2026-11-15')
  })

  it('looks only as far ahead as the church set — 0 is the day itself', () => {
    expect(ask({ days: 1 })).toEqual([])
    expect(shape(ask({ days: 2 }))).toEqual(['2026-11-22: Sound 06:30, Worship 07:00'])
    expect(ask({ days: 0 })).toEqual([])
    expect(shape(ask({ days: 0, today: '2026-11-22', now: new Date('2026-11-22T05:00:00').getTime() }))).toEqual(['2026-11-22: Sound 06:30, Worship 07:00'])
    expect(ask({ days: 9 }).map((d) => d.date)).toEqual(['2026-11-22', '2026-11-25', '2026-11-29'])
  })

  describe('goes away once the call time is reached', () => {
    const on = (clock: string) => new Date(`2026-11-22T${clock}:00`).getTime()
    const sunday = (clock: string, stayMinutes = 0) => shape(ask({ today: '2026-11-22', now: on(clock), days: 0, stayMinutes }))

    it('is there a minute before', () => {
      expect(sunday('06:29')).toEqual(['2026-11-22: Sound 06:30, Worship 07:00'])
    })

    it('drops a team at its own call time, and keeps the one still to come', () => {
      expect(sunday('06:30')).toEqual(['2026-11-22: Worship 07:00'])
    })

    it('drops the day with its last team', () => {
      expect(sunday('07:00')).toEqual([])
    })

    it('stays as long after the call time as the church set', () => {
      expect(sunday('06:44', 15)).toEqual(['2026-11-22: Sound 06:30, Worship 07:00'])
      expect(sunday('06:45', 15)).toEqual(['2026-11-22: Worship 07:00'])
      expect(sunday('07:15', 15)).toEqual([])
    })

    it('still shows the next service day, later that morning', () => {
      expect(shape(ask({ today: '2026-11-22', now: on('09:00'), days: 7 }))).toEqual(['2026-11-25: Sound 07:00, Worship 07:00', '2026-11-29: Worship 07:00, Sound 07:45'])
    })
  })

  describe('for whoever the rota put on, when the church asks for that', () => {
    it('keeps a team only on the days I am on its rota', () => {
      const onRota = new Set(['s-mal:sound', 's-wed:worship'])
      expect(shape(ask({ onRota }))).toEqual(['2026-11-22: Sound 06:30', '2026-11-25: Worship 07:00'])
    })

    it('shows nothing to somebody the rota has not put on', () => {
      expect(ask({ onRota: new Set() })).toEqual([])
    })

    it('counts a place on a team I am not otherwise on', () => {
      expect(shape(ask({ mine: [], onRota: new Set(['s-eng:kids']) }))).toEqual(['2026-11-22: Kids 08:15'])
    })
  })

  it('gives each time as a moment, for the countdown', () => {
    expect(ask()[0].teams[0].at).toBe(callMoment('2026-11-22', '06:30'))
  })

  it('has nothing to say to somebody on no team, or about a team it cannot see', () => {
    expect(ask({ mine: [] })).toEqual([])
    expect(ask({ mine: ['gone'] })).toEqual([])
  })
})

describe('the day, as somebody would say it', () => {
  it('says Today and Tomorrow, and otherwise names the day', () => {
    expect(relativeDay('2026-11-20', '2026-11-20')).toBe('Today')
    expect(relativeDay('2026-11-21', '2026-11-20')).toBe('Tomorrow')
    expect(relativeDay('2026-11-22', '2026-11-20')).toMatch(/Sun/)
  })
})
