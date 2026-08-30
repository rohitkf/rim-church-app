import { describe, expect, it } from 'vitest'
import { orderServices, serviceStanding } from './serviceState'

const at = (hhmm: string, minutes: number | null = 30) => ({
  id: hhmm,
  start_time: `2026-08-30T${hhmm}:00.000Z`,
  duration_minutes: minutes,
})

const clock = (hhmm: string) => new Date(`2026-08-30T${hhmm}:00.000Z`).getTime()

describe('where a service stands against the clock', () => {
  const sessions = [at('09:00'), at('09:30'), at('10:00', 60)] // 09:00 → 11:00

  it('is upcoming before the first session starts', () => {
    expect(serviceStanding(sessions, clock('08:59')).state).toBe('upcoming')
  })

  it('is running from the first start until the last session ends', () => {
    expect(serviceStanding(sessions, clock('09:00')).state).toBe('running')
    expect(serviceStanding(sessions, clock('10:59')).state).toBe('running')
  })

  it('completes itself the moment the last session ends — nothing to press', () => {
    expect(serviceStanding(sessions, clock('11:00')).state).toBe('done')
    expect(serviceStanding(sessions, clock('23:00')).state).toBe('done')
  })

  it('says so rather than guessing when no running order exists', () => {
    const standing = serviceStanding([], clock('09:00'))
    expect(standing).toEqual({ state: 'unplanned', from: null, to: null })
  })
})

describe('the order the day is shown in', () => {
  it('puts what is on now first, then what is coming, and finished last', () => {
    const services = [
      { id: 'done', sessions: [at('08:00', 30)] },
      { id: 'later', sessions: [at('14:00', 60)] },
      { id: 'now', sessions: [at('09:00', 90)] },
      { id: 'unplanned', sessions: [] },
    ]
    const ordered = orderServices(services, (s) => serviceStanding(s.sessions, clock('09:30')))
    expect(ordered.map((s) => s.id)).toEqual(['now', 'later', 'unplanned', 'done'])
  })

  it('keeps two services in the same state in the order they happen', () => {
    const services = [
      { id: 'second', sessions: [at('14:00')] },
      { id: 'first', sessions: [at('11:00')] },
    ]
    const ordered = orderServices(services, (s) => serviceStanding(s.sessions, clock('09:00')))
    expect(ordered.map((s) => s.id)).toEqual(['first', 'second'])
  })
})

describe('a service somebody called the end of', () => {
  const iso = (hhmm: string) => `2026-08-30T${hhmm}:00.000Z`
  const sessions = [at('10:00', 20), at('10:20', 40)]

  it('is over from the moment it was called, not when the plan said', () => {
    // Ten minutes of plan still to run, but it was called at 10:50.
    expect(serviceStanding(sessions, clock('10:55')).state).toBe('running')
    expect(serviceStanding(sessions, clock('10:55'), iso('10:50')).state).toBe('done')
    expect(serviceStanding(sessions, clock('10:55'), iso('10:50')).to).toBe(clock('10:50'))
  })

  it('is not over before the end that was called comes round', () => {
    expect(serviceStanding(sessions, clock('10:30'), iso('10:50')).state).toBe('running')
  })

  it('still falls back to the clock when nobody called it', () => {
    expect(serviceStanding(sessions, clock('11:05'), null).state).toBe('done')
    expect(serviceStanding(sessions, clock('10:30'), null).state).toBe('running')
  })
})
