import { describe, expect, it } from 'vitest'
import lockMigration from '../../../supabase/migrations/0294_a_service_held_open_is_not_finished.sql?raw'
import {
  EDIT_GRACE_MS,
  HOLD_BELIEVED_MS,
  heldOpen,
  editingLocked,
  editingLocksAt,
  serviceStanding,
} from './serviceState'

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

describe('the hour after a service ends', () => {
  const iso = (hhmm: string) => `2026-08-30T${hhmm}:00.000Z`
  const sessions = [at('10:00', 20), at('10:20', 40)] // ends 11:00

  it('stays open for an hour after the last session was due to end', () => {
    expect(editingLocked(sessions, clock('11:05'))).toBe(false)
    expect(editingLocked(sessions, clock('11:59'))).toBe(false)
    expect(editingLocked(sessions, clock('12:01'))).toBe(true)
  })

  it('counts the hour from the end that was called, not the plan', () => {
    // Called at 10:40, twenty minutes before the plan said.
    expect(editingLocked(sessions, clock('11:35'), iso('10:40'))).toBe(false)
    expect(editingLocked(sessions, clock('11:45'), iso('10:40'))).toBe(true)
  })

  it('says when it closes, so the page can count it down', () => {
    expect(editingLocksAt(sessions)).toBe(clock('12:00'))
    expect(editingLocksAt(sessions, iso('10:40'))).toBe(clock('11:40'))
    expect(EDIT_GRACE_MS).toBe(60 * 60 * 1000)
  })

  it('is not closing at all when there is nothing to go on', () => {
    expect(editingLocksAt([])).toBeNull()
    expect(editingLocked([], clock('23:00'))).toBe(false)
  })
})

describe('an editing window the church chose', () => {
  const sessions = [
    { id: 'a', start_time: '2026-09-06T09:00:00Z', duration_minutes: 60 },
  ]
  const ended = '2026-09-06T10:00:00Z'
  const at = (iso: string) => Date.parse(iso)

  it('locks on the grace it is given rather than the shipped hour', () => {
    const tenMinutes = 10 * 60 * 1000
    expect(editingLocked(sessions, at('2026-09-06T10:05:00Z'), ended, tenMinutes)).toBe(false)
    expect(editingLocked(sessions, at('2026-09-06T10:15:00Z'), ended, tenMinutes)).toBe(true)
  })

  it('can be opened up to a whole day', () => {
    const aDay = 24 * 60 * 60 * 1000
    expect(editingLocked(sessions, at('2026-09-06T20:00:00Z'), ended, aDay)).toBe(false)
    expect(editingLocksAt(sessions, ended, aDay)).toBe(at('2026-09-07T10:00:00Z'))
  })

  it('still falls back to the hour it shipped with', () => {
    expect(editingLocksAt(sessions, ended)).toBe(at('2026-09-06T10:00:00Z') + EDIT_GRACE_MS)
  })
})

describe('a service somebody is holding open past its plan', () => {
  // 09:00 → 11:00, and the last session has been marked not started.
  const held = [at('09:00'), at('09:30'), { ...at('10:00', 60), held_at: '2026-08-30T10:00:00.000Z' }]
  const plain = [at('09:00'), at('09:30'), at('10:00', 60)]
  const NOT_ENDED = '2026-08-30T10:58:00.000Z'

  it('is not finished while a session is still marked not started, however far past the planned end', () => {
    expect(serviceStanding(plain, clock('11:20')).state).toBe('done')
    expect(serviceStanding(held, clock('11:20')).state).toBe('running')
    expect(serviceStanding(held, clock('13:00')).state).toBe('running')
  })

  it('is not finished while the service is marked not ended', () => {
    expect(serviceStanding(plain, clock('11:20'), null, NOT_ENDED).state).toBe('running')
  })

  it('is finished the moment the end is called, whatever is held', () => {
    expect(serviceStanding(held, clock('11:21'), '2026-08-30T11:20:00.000Z', NOT_ENDED)).toMatchObject({
      state: 'done',
      to: clock('11:20'),
    })
  })

  it('takes no notice of a hold on a session that was dropped', () => {
    const dropped = [at('09:00'), { ...at('09:30'), held_at: '2026-08-30T09:30:00.000Z', skipped_at: '2026-08-30T09:31:00.000Z' }]
    expect(serviceStanding(dropped, clock('10:30')).state).toBe('done')
  })

  it('stops believing a hold six hours after the planned end, so a forgotten one does not keep the day open', () => {
    const lastBelieved = clock('11:00') + HOLD_BELIEVED_MS - 1
    expect(heldOpen(held, lastBelieved)).toBe(true)
    expect(serviceStanding(held, lastBelieved).state).toBe('running')
    expect(heldOpen(held, lastBelieved + 1)).toBe(false)
    expect(serviceStanding(held, lastBelieved + 1).state).toBe('done')
    expect(serviceStanding(plain, lastBelieved + 1, null, NOT_ENDED).state).toBe('done')
  })

  it('changes nothing before the planned end', () => {
    expect(serviceStanding(held, clock('08:00')).state).toBe('upcoming')
    expect(serviceStanding(held, clock('10:30')).state).toBe('running')
  })

  it('does not lock the running order while it is held open', () => {
    // An hour after the planned end the plain service locks; the held one does not.
    expect(editingLocked(plain, clock('12:01'))).toBe(true)
    expect(editingLocked(held, clock('12:01'))).toBe(false)
    expect(editingLocked(plain, clock('12:01'), null, EDIT_GRACE_MS, NOT_ENDED)).toBe(false)
    // Once the hold is no longer believed, it is locked like any other.
    expect(editingLocked(held, clock('11:00') + HOLD_BELIEVED_MS)).toBe(true)
    expect(editingLocksAt(held)).toBe(clock('11:00') + HOLD_BELIEVED_MS)
  })

  it('locks an hour after the end that was called, held or not', () => {
    expect(editingLocksAt(held, '2026-08-30T11:20:00.000Z', EDIT_GRACE_MS, NOT_ENDED)).toBe(clock('12:20'))
  })
})

describe('the database’s lock and the app’s rule', () => {
  it('believe a hold for the same length of time', () => {
    const hours = HOLD_BELIEVED_MS / 3_600_000
    expect(lockMigration).toContain(`interval '${hours} hours'`)
    // And it reads both holds: a session not started, the service not ended.
    expect(lockMigration).toContain('held_at is not null and skipped_at is null')
    expect(lockMigration).toContain('end_held_at')
  })
})

