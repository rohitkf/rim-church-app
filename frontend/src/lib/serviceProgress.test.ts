import { describe, expect, it } from 'vitest'
import {
  nextToStart,
  overrunMinutes,
  serviceBounds,
  serviceProgress,
  startableSession,
} from './serviceProgress'

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

describe('serviceBounds', () => {
  it('runs from the first start to the end of the last session', () => {
    const b = serviceBounds(ORDER)!
    expect(new Date(b.from).toISOString()).toBe(at('10:00'))
    expect(new Date(b.to).toISOString()).toBe(at('11:10'))
  })

  it('says nothing rather than inventing times for an unplanned service', () => {
    expect(serviceBounds([])).toBeNull()
    expect(serviceBounds([{ id: 'x', start_time: 'nope', duration_minutes: 5 }])).toBeNull()
  })
})

describe('nextToStart', () => {
  it('is the first session still ahead of the clock', () => {
    expect(nextToStart(ORDER, clock('10:30'))).toBe('c')
  })

  it('is the very first session before the service begins, so a late start can be said', () => {
    expect(nextToStart(ORDER, clock('09:00'))).toBe('a')
  })

  it('is nothing once every session has begun', () => {
    expect(nextToStart(ORDER, clock('11:05'))).toBeNull()
  })
})

describe('startableSession', () => {
  it('is the first session before the service has begun, so a late start can be said', () => {
    expect(startableSession(ORDER, clock('09:00'))).toBe('a')
  })

  it('is the session the clock says is on — the one a late service is waiting to begin', () => {
    // Worship overran; the plan has moved on to b, and b is what has not
    // actually started yet.
    expect(startableSession(ORDER, clock('10:30'))).toBe('b')
  })

  it('is nothing once the service is over', () => {
    expect(startableSession(ORDER, clock('11:30'))).toBeNull()
  })

  it('is never a session whose start is still in the future, which could only move earlier', () => {
    const id = startableSession(ORDER, clock('10:30'))!
    const start = new Date(ORDER.find((s) => s.id === id)!.start_time).getTime()
    expect(start).toBeLessThanOrEqual(clock('10:30'))
  })
})

describe('overrunMinutes', () => {
  it('finds nothing in a running order that has not slipped', () => {
    expect(overrunMinutes(ORDER).size).toBe(0)
  })

  it('measures the overrun as the gap between due-to-end and actually-ended', () => {
    // "Session started" pressed on c at 11:06 — b was due to end at 11:00.
    const slipped = [ORDER[0], ORDER[1], { ...ORDER[2], start_time: at('11:06') }]
    const over = overrunMinutes(slipped)
    expect(over.get('b')).toBe(6)
    expect(over.has('a')).toBe(false)
    expect(over.has('c')).toBe(false)
  })

  it('does not report a session that finished early as overrunning', () => {
    const early = [ORDER[0], ORDER[1], { ...ORDER[2], start_time: at('10:50') }]
    expect(overrunMinutes(early).has('b')).toBe(false)
  })

  it('cannot measure the last session, because nothing has proved it ended', () => {
    expect(overrunMinutes([ORDER[0]]).size).toBe(0)
  })
})
