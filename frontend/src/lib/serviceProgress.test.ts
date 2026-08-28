import { describe, expect, it } from 'vitest'
import { serviceProgress } from './serviceProgress'

const at = (hhmm: string) => `2026-08-30T${hhmm}:00.000Z`
const clock = (hhmm: string) => new Date(at(hhmm)).getTime()

const ORDER = [
  { id: 'a', start_time: at('10:00'), duration_minutes: 20 },
  { id: 'b', start_time: at('10:20'), duration_minutes: 40 },
  { id: 'c', start_time: at('11:00'), duration_minutes: 10 },
]

describe('serviceProgress', () => {
  it('is entirely quiet before the service starts', () => {
    const p = serviceProgress(ORDER, clock('09:00'))
    expect(p.started).toBe(false)
    expect(p.runningId).toBeNull()
    expect([...p.byId.values()].every((s) => s.state === 'ahead' && s.fill === 0)).toBe(true)
  })

  it('names the session that is on, and only that one', () => {
    const p = serviceProgress(ORDER, clock('10:30'))
    expect(p.runningId).toBe('b')
    expect(p.byId.get('a')!.state).toBe('done')
    expect(p.byId.get('c')!.state).toBe('ahead')
  })

  it('fills the running session by how much of it has gone', () => {
    // Ten minutes into a forty-minute session.
    expect(serviceProgress(ORDER, clock('10:30')).byId.get('b')!.fill).toBeCloseTo(0.25)
    expect(serviceProgress(ORDER, clock('10:40')).byId.get('b')!.fill).toBeCloseTo(0.5)
  })

  it('fills everything behind it completely', () => {
    const p = serviceProgress(ORDER, clock('11:05'))
    expect(p.byId.get('a')!.fill).toBe(1)
    expect(p.byId.get('b')!.fill).toBe(1)
    expect(p.byId.get('c')!.state).toBe('running')
  })

  it('knows when the service is over', () => {
    const p = serviceProgress(ORDER, clock('11:30'))
    expect(p.finished).toBe(true)
    expect(p.runningId).toBeNull()
    expect([...p.byId.values()].every((s) => s.state === 'done')).toBe(true)
  })

  it('treats a session with no length as a moment, not a window to sit in', () => {
    const order = [{ id: 'x', start_time: at('10:00'), duration_minutes: 0 }]
    expect(serviceProgress(order, clock('09:59')).byId.get('x')!.state).toBe('ahead')
    expect(serviceProgress(order, clock('10:01')).byId.get('x')!.state).toBe('done')
  })

  it('says nothing at all rather than guessing when there is no running order', () => {
    expect(serviceProgress([], clock('10:30')).runningId).toBeNull()
    expect(serviceProgress([{ id: 'x', start_time: 'not a time', duration_minutes: 5 }]).started).toBe(
      false,
    )
  })

  it('is not fooled by sessions arriving out of order', () => {
    const shuffled = [ORDER[2], ORDER[0], ORDER[1]]
    const p = serviceProgress(shuffled, clock('10:30'))
    expect(p.runningId).toBe('b')
    expect(p.started).toBe(true)
    expect(p.finished).toBe(false)
  })
})
