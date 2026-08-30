import { describe, expect, it } from 'vitest'
import {
  nextToStart,
  runVariance,
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

describe('runVariance', () => {
  it('is silent on a plan nothing has happened to', () => {
    expect(runVariance(ORDER).size).toBe(0)
  })

  it('measures an overrun as the gap the next session opened up', () => {
    const slipped = ORDER.map((s) => (s.id === 'c' ? { ...s, start_time: at('11:10') } : s))
    const over = runVariance(slipped)
    expect(over.get('b')).toBe(10)
    expect(over.has('a')).toBe(false)
  })

  it('measures an under-run too, as a negative', () => {
    // A service that keeps finishing early is a plan that needs correcting,
    // and that is invisible if only the late ones are counted.
    const early = ORDER.map((s) => (s.id === 'c' ? { ...s, start_time: at('10:55') } : s))
    expect(runVariance(early).get('b')).toBe(-5)
  })

  it('measures past a skipped session to whatever actually followed', () => {
    const skipped = ORDER.map((s) =>
      s.id === 'b' ? { ...s, skipped_at: at('10:20') } : s,
    )
    // 'a' ends at 10:20 by the plan and 'c' begins at 11:00, so 'a' ran 40
    // minutes long — the dropped session in between took no time at all.
    expect(runVariance(skipped).get('a')).toBe(40)
    expect(runVariance(skipped).has('b')).toBe(false)
  })

  it('says nothing about the last session — nothing proves it ended', () => {
    expect(runVariance([ORDER[0]]).size).toBe(0)
  })
})

describe('a skipped session', () => {
  const skipped = ORDER.map((s) => (s.id === 'b' ? { ...s, skipped_at: at('10:20') } : s))

  it('never counts as running, whatever the clock says', () => {
    const p = serviceProgress(skipped, clock('10:30'))
    expect(p.byId.get('b')!.state).toBe('skipped')
    expect(p.byId.get('b')!.fill).toBe(0)
    expect(p.runningId).toBeNull()
  })

  it('is never the session offered as startable', () => {
    expect(startableSession(skipped, clock('10:30'))).toBe('c')
    expect(nextToStart(skipped, clock('10:00'))).toBe('c')
  })
})

describe('when the end of the service is called', () => {
  it('gives the closing session the variance it could never have', () => {
    // Nothing follows 'c', so on the clock alone it can never be measured.
    expect(runVariance(ORDER).has('c')).toBe(false)
    // It was due to end at 11:10; the end was called at 11:04.
    expect(runVariance(ORDER, at('11:04')).get('c')).toBe(-6)
    expect(runVariance(ORDER, at('11:18')).get('c')).toBe(8)
  })

  it('says nothing when it ended exactly on time', () => {
    expect(runVariance(ORDER, at('11:10')).has('c')).toBe(false)
  })

  it('ignores an unreadable end rather than inventing one', () => {
    expect(runVariance(ORDER, 'not a time').has('c')).toBe(false)
  })
})

describe('a session held back as not started', () => {
  const held = ORDER.map((s) => (s.id === 'b' ? { ...s, held_at: at('10:20') } : s))

  it('is never running, however far the clock has gone past its start', () => {
    const p = serviceProgress(held, clock('10:45'))
    expect(p.byId.get('b')!.state).toBe('ahead')
    expect(p.byId.get('b')!.fill).toBe(0)
    expect(p.runningId).toBeNull()
  })

  it('is still the session the service is waiting to start', () => {
    expect(startableSession(held, clock('10:45'))).toBe('b')
  })
})
