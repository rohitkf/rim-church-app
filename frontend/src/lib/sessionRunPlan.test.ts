import { describe, expect, it } from 'vitest'
import {
  frontIndex,
  jumpedSessions,
  skipPlan,
  snapshotFor,
  startAtPlan,
  unskipPlan,
  type RunSession,
} from './sessionRunPlan'

const T = (hhmm: string) => `2026-09-06T${hhmm}:00.000Z`
const at = (hhmm: string) => new Date(T(hhmm)).getTime()

/** Worship 11:30+15, Intercessory 11:45+8, Worship 2 11:53+40, Offering 12:33+7. */
function plan(): RunSession[] {
  return [
    { id: 'a', session_name: 'Worship 1', start_time: T('11:30'), duration_minutes: 15 },
    { id: 'b', session_name: 'Intercessory', start_time: T('11:45'), duration_minutes: 8 },
    { id: 'c', session_name: 'Worship 2', start_time: T('11:53'), duration_minutes: 40 },
    { id: 'd', session_name: 'Offering', start_time: T('12:33'), duration_minutes: 7 },
  ]
}

const times = (writes: ReturnType<typeof startAtPlan>) =>
  Object.fromEntries(writes.filter((w) => w.patch.start_time).map((w) => [w.id, w.patch.start_time]))

describe('frontIndex', () => {
  it('is the session on right now', () => {
    expect(frontIndex(plan(), at('11:47'))).toBe(1)
  })

  it('is the next one when nothing is on', () => {
    expect(frontIndex(plan(), at('11:00'))).toBe(0)
  })

  it('never lands on a skipped session', () => {
    const p = plan()
    p[1].skipped_at = T('11:45')
    expect(frontIndex(p, at('11:47'))).toBe(2)
  })
})

describe('startAtPlan', () => {
  it('starts the session now and pushes everything after it', () => {
    // Worship 1 ran nine minutes long; Intercessory really starts at 11:54.
    const writes = startAtPlan(plan(), 1, at('11:54'))
    expect(times(writes)).toEqual({
      b: T('11:54'),
      c: T('12:02'),
      d: T('12:42'),
    })
    // The session it came from keeps its own start — that is what makes the
    // overrun visible rather than erasing it.
    expect(writes.some((w) => w.id === 'a')).toBe(false)
  })

  it('pulls a late plan earlier just as readily', () => {
    const writes = startAtPlan(plan(), 2, at('11:50'))
    expect(times(writes).c).toBe(T('11:50'))
    expect(times(writes).d).toBe(T('12:30'))
  })

  it('marks what it jumped over as skipped, with the reason', () => {
    const writes = startAtPlan(plan(), 2, at('11:47'), '  ran out of time  ')
    const b = writes.find((w) => w.id === 'b')
    expect(b?.patch.skipped_at).toBe(T('11:47'))
    expect(b?.patch.skip_reason).toBe('ran out of time')
  })

  it('gives a jumped session no length, so the rest do not drift', () => {
    // Intercessory's 8 minutes must not still be counted after it is dropped.
    const writes = startAtPlan(plan(), 2, at('11:47'))
    expect(times(writes).c).toBe(T('11:47'))
    expect(times(writes).d).toBe(T('12:27'))
  })

  it('skips nothing when starting the session already at the front', () => {
    const writes = startAtPlan(plan(), 1, at('11:47'))
    expect(writes.every((w) => w.patch.skipped_at === undefined)).toBe(true)
  })

  it('un-skips a session that is being started after all', () => {
    const p = plan()
    p[1].skipped_at = T('11:40')
    const writes = startAtPlan(p, 1, at('11:47'))
    const b = writes.find((w) => w.id === 'b')
    expect(b?.patch.skipped_at).toBeNull()
    expect(b?.patch.skip_reason).toBeNull()
    // ...and it takes its full eight minutes again.
    expect(times(writes).c).toBe(T('11:55'))
  })

  it('leaves an unchanged row alone rather than writing it', () => {
    expect(startAtPlan(plan(), 0, at('11:30'))).toEqual([])
  })
})

describe('jumpedSessions', () => {
  it('names everything between the front and the target', () => {
    expect(jumpedSessions(plan(), 3, at('11:47')).map((s) => s.id)).toEqual(['b', 'c'])
  })

  it('is empty going forwards one step, or backwards', () => {
    expect(jumpedSessions(plan(), 1, at('11:47'))).toEqual([])
    expect(jumpedSessions(plan(), 0, at('11:47'))).toEqual([])
  })

  it('does not re-skip what is already skipped', () => {
    const p = plan()
    p[2].skipped_at = T('11:50')
    expect(jumpedSessions(p, 3, at('11:47')).map((s) => s.id)).toEqual(['b'])
  })
})

describe('skipPlan', () => {
  it('drops the live session and starts the next one now', () => {
    const writes = skipPlan(plan(), 1, at('11:47'), 'speaker not here')
    const b = writes.find((w) => w.id === 'b')
    expect(b?.patch.skipped_at).toBe(T('11:47'))
    expect(b?.patch.skip_reason).toBe('speaker not here')
    expect(times(writes).c).toBe(T('11:47'))
    expect(times(writes).d).toBe(T('12:27'))
  })

  it('does not drag the service backwards to drop something later on', () => {
    // Skipping Offering at 11:47 must not move Worship 2 to 11:47.
    const writes = skipPlan(plan(), 3, at('11:47'), null)
    expect(times(writes).c).toBeUndefined()
    expect(writes.find((w) => w.id === 'd')?.patch.skipped_at).toBe(T('11:47'))
  })

  it('closes the gap a dropped future session leaves', () => {
    const writes = skipPlan(plan(), 2, at('11:47'), null)
    expect(times(writes).d).toBe(T('11:53'))
  })

  it('stores a blank reason as nothing at all', () => {
    const writes = skipPlan(plan(), 1, at('11:47'), '   ')
    expect(writes.find((w) => w.id === 'b')?.patch.skip_reason).toBeNull()
  })
})

describe('unskipPlan', () => {
  it('gives the session its time back and moves the rest along', () => {
    const p = plan()
    p[1].skipped_at = T('11:45')
    p[2].start_time = T('11:45')
    p[3].start_time = T('12:25')
    const writes = unskipPlan(p, 1)
    expect(writes.find((w) => w.id === 'b')?.patch.skipped_at).toBeNull()
    expect(times(writes).c).toBe(T('11:53'))
    expect(times(writes).d).toBe(T('12:33'))
  })
})

describe('snapshotFor', () => {
  it('restores exactly the fields a plan was going to change', () => {
    const p = plan()
    p[1].skipped_at = T('11:40')
    const writes = startAtPlan(p, 1, at('11:47'))
    const back = snapshotFor(p, writes)
    expect(back.find((w) => w.id === 'b')?.patch).toEqual({
      start_time: T('11:45'),
      skipped_at: T('11:40'),
      skip_reason: null,
    })
    expect(back.find((w) => w.id === 'c')?.patch).toEqual({ start_time: T('11:53') })
  })

  it('covers every row the plan touches', () => {
    const writes = skipPlan(plan(), 1, at('11:47'), 'why')
    expect(snapshotFor(plan(), writes).map((w) => w.id)).toEqual(writes.map((w) => w.id))
  })
})
