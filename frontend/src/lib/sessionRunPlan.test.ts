import { describe, expect, it } from 'vitest'
import {
  addTimePlan,
  frontIndex,
  heldBackBy,
  holdPlan,
  releasePlan,
  jumpedSessions,
  skipPlan,
  snapshotFor,
  startAtPlan,
  unskipPlan,
  type RunSession,
} from './sessionRunPlan'
import { runVariance } from './serviceProgress'

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
    // Intercessory is on at 11:47; starting Offering jumps Worship 2.
    const writes = startAtPlan(plan(), 3, at('11:47'), '  ran out of time  ')
    const c = writes.find((w) => w.id === 'c')
    expect(c?.patch.skipped_at).toBe(T('11:47'))
    expect(c?.patch.skip_reason).toBe('ran out of time')
  })

  it('does not skip the session that is on when the next one is started', () => {
    // The whole point of pressing the next one is that this one finished —
    // early, usually. Marking it skipped would say it never happened.
    const writes = startAtPlan(plan(), 2, at('11:47'))
    expect(writes.every((w) => w.patch.skipped_at === undefined)).toBe(true)
    expect(times(writes).c).toBe(T('11:47'))
  })

  it('gives a jumped session no length, so the rest do not drift', () => {
    // Worship 2's 40 minutes must not still be counted after it is dropped.
    const writes = startAtPlan(plan(), 3, at('11:47'))
    expect(times(writes).d).toBe(T('11:47'))
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
  it('names everything between the session on now and the target', () => {
    // Intercessory is on at 11:47. Starting Offering misses only Worship 2.
    expect(jumpedSessions(plan(), 3, at('11:47')).map((s) => s.id)).toEqual(['c'])
  })

  it('is empty going forwards one step, or backwards', () => {
    expect(jumpedSessions(plan(), 2, at('11:47'))).toEqual([])
    expect(jumpedSessions(plan(), 1, at('11:47'))).toEqual([])
    expect(jumpedSessions(plan(), 0, at('11:47'))).toEqual([])
  })

  it('does jump the next session up when nothing is running yet', () => {
    // Before the service there is nothing that has "just ended", so the
    // first session is genuinely being skipped past.
    expect(jumpedSessions(plan(), 1, at('11:00')).map((s) => s.id)).toEqual(['a'])
  })

  it('does not re-skip what is already skipped', () => {
    const p = plan()
    p[2].skipped_at = T('11:50')
    expect(jumpedSessions(p, 3, at('11:47'))).toEqual([])
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

/*
 * The rules, stated the way somebody running a service states them.
 *
 * Session 1 is on. Pressing 2 starts 2 and gives 1 its over/under. Pressing
 * 3 skips 2, starts 3, and still gives 1 its over/under. Session 1 is never
 * marked skipped either way: it happened, it is the thing that just ended.
 */
describe('starting a later session while one is running', () => {
  const three = (): RunSession[] => [
    { id: 's1', session_name: 'Session 1', start_time: T('11:00'), duration_minutes: 30 },
    { id: 's2', session_name: 'Session 2', start_time: T('11:30'), duration_minutes: 20 },
    { id: 's3', session_name: 'Session 3', start_time: T('11:50'), duration_minutes: 15 },
  ]
  // Session 1 is on: 11:00 to 11:30, and it is 11:20.
  const nowInS1 = at('11:20')

  it('the next one: starts it, skips nothing', () => {
    expect(jumpedSessions(three(), 1, nowInS1)).toEqual([])
    const writes = startAtPlan(three(), 1, nowInS1)
    expect(writes.some((w) => w.patch.skipped_at !== undefined)).toBe(false)
    expect(times(writes).s2).toBe(T('11:20'))
    expect(times(writes).s3).toBe(T('11:40'))
    expect(writes.some((w) => w.id === 's1')).toBe(false)
  })

  it('the next one: leaves session 1 its under-run to show', () => {
    const after = three().map((s) => {
      const w = startAtPlan(three(), 1, nowInS1).find((x) => x.id === s.id)
      return w?.patch.start_time ? { ...s, start_time: w.patch.start_time } : s
    })
    // Due to end 11:30, actually ended 11:20 — ten minutes early.
    expect(runVariance(after).get('s1')).toBe(-10)
  })

  it('stamps a jumped session at the moment it was dropped', () => {
    // Not left at 11:30, which would read as a later slot than the session
    // that replaced it.
    const writes = startAtPlan(three(), 2, nowInS1, 'no time')
    expect(times(writes).s2).toBe(T('11:20'))
    expect(times(writes).s3).toBe(T('11:20'))
  })

  it('one further on: skips only the session in between', () => {
    expect(jumpedSessions(three(), 2, nowInS1).map((s) => s.id)).toEqual(['s2'])
    const writes = startAtPlan(three(), 2, nowInS1, 'no time')
    expect(writes.find((w) => w.id === 's2')?.patch.skipped_at).toBe(T('11:20'))
    expect(writes.find((w) => w.id === 's1')).toBeUndefined()
    expect(times(writes).s3).toBe(T('11:20'))
  })

  it('one further on: still leaves session 1 its under-run', () => {
    const writes = startAtPlan(three(), 2, nowInS1, 'no time')
    const after = three().map((s) => {
      const w = writes.find((x) => x.id === s.id)
      if (!w) return s
      return {
        ...s,
        ...(w.patch.start_time ? { start_time: w.patch.start_time } : {}),
        ...(w.patch.skipped_at !== undefined ? { skipped_at: w.patch.skipped_at } : {}),
      }
    })
    // Session 2 is skipped, so session 1 is measured against session 3.
    expect(runVariance(after).get('s1')).toBe(-10)
  })

  it('starts session 2 late without skipping anything', () => {
    // Session 1 overran: by 11:35 the plan has already moved on to session
    // 2, so pressing session 2 is recording that it is only starting now.
    expect(jumpedSessions(three(), 1, at('11:35'))).toEqual([])
    const writes = startAtPlan(three(), 1, at('11:35'))
    expect(writes.some((w) => w.patch.skipped_at !== undefined)).toBe(false)
    expect(times(writes).s2).toBe(T('11:35'))
  })

  it('skips the session in a gap, where nothing is on to have just ended', () => {
    // Session 1 done at 11:30, session 2 pushed back to 11:40, and it is
    // 11:35: nothing is running, so session 2 is genuinely being skipped
    // past rather than being the thing that just finished.
    const gapped = three().map((s) =>
      s.id === 's2' ? { ...s, start_time: T('11:40') } : s,
    )
    expect(jumpedSessions(gapped, 2, at('11:35')).map((s) => s.id)).toEqual(['s2'])
    const writes = startAtPlan(gapped, 2, at('11:35'))
    expect(writes.find((w) => w.id === 's2')?.patch.skipped_at).toBe(T('11:35'))
    expect(writes.find((w) => w.id === 's1')).toBeUndefined()
  })
})

describe('addTimePlan', () => {
  it('lengthens the session and moves everything after it', () => {
    const writes = addTimePlan(plan(), 1, 10, 'Pastor asked for ten more')
    const b = writes.find((w) => w.id === 'b')
    expect(b?.patch.duration_minutes).toBe(18)
    expect(b?.patch.added_minutes).toBe(10)
    expect(b?.patch.added_note).toBe('Pastor asked for ten more')
    // Its own start does not move; the ten minutes land on what follows.
    expect(b?.patch.start_time).toBeUndefined()
    expect(times(writes).c).toBe(T('12:03'))
    expect(times(writes).d).toBe(T('12:43'))
  })

  it('keeps a running total when more is asked for twice', () => {
    const once = addTimePlan(plan(), 1, 10)
    const after = plan().map((s) =>
      s.id === 'b' ? { ...s, duration_minutes: 18, added_minutes: 10 } : s,
    )
    expect(once.find((w) => w.id === 'b')?.patch.added_minutes).toBe(10)
    expect(addTimePlan(after, 1, 5).find((w) => w.id === 'b')?.patch.added_minutes).toBe(15)
    expect(addTimePlan(after, 1, 5).find((w) => w.id === 'b')?.patch.duration_minutes).toBe(23)
  })

  it('refuses nothing, a negative, or a number that is not one', () => {
    expect(addTimePlan(plan(), 1, 0)).toEqual([])
    expect(addTimePlan(plan(), 1, -10)).toEqual([])
    expect(addTimePlan(plan(), 1, Number.NaN)).toEqual([])
  })

  it('gives a skipped session no length back, so the rest do not drift', () => {
    const p = plan()
    p[2].skipped_at = T('11:50')
    // Worship 2 is skipped, so Offering still follows Intercessory directly.
    expect(times(addTimePlan(p, 1, 10)).d).toBe(T('12:03'))
  })
})

describe('holdPlan', () => {
  it('says the session has not begun, and moves no time', () => {
    const writes = holdPlan(plan(), 2, at('11:55'))
    expect(writes).toEqual([{ id: 'c', patch: { held_at: T('11:55') } }])
  })

  it('does not repeat itself', () => {
    const p = plan()
    p[2].held_at = T('11:55')
    expect(holdPlan(p, 2, at('11:58'))).toEqual([])
  })

  it('is taken back by releasing it', () => {
    const p = plan()
    p[2].held_at = T('11:55')
    expect(releasePlan(p, 2)).toEqual([{ id: 'c', patch: { held_at: null } }])
    expect(releasePlan(plan(), 2)).toEqual([])
  })

  it('is cleared by starting the session, whatever else that does', () => {
    const p = plan()
    p[2].held_at = T('11:55')
    const started = startAtPlan(p, 2, at('11:58'))
    expect(started.find((w) => w.id === 'c')?.patch.held_at).toBeNull()
  })
})

describe('heldBackBy', () => {
  it('names the session that is holding the service on this one', () => {
    const p = plan()
    p[2].held_at = T('11:55')
    expect(heldBackBy(p, 1)?.id).toBe('c')
    expect(heldBackBy(p, 0)).toBeNull()
  })

  it('looks past a skipped session to the one that is actually next', () => {
    const p = plan()
    p[2].skipped_at = T('11:50')
    p[3].held_at = T('11:55')
    expect(heldBackBy(p, 1)?.id).toBe('d')
  })
})
