import { describe, expect, it } from 'vitest'
import { clockFace, serviceClock, type ClockSession } from './serviceClock'
import { addTimePlan, holdPlan, type RunWrite } from './sessionRunPlan'

const at = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00`).getTime()
const iso = (hhmm: string) => new Date(at(hhmm)).toISOString()

function session(id: string, start: string, minutes: number, extra: Partial<ClockSession> = {}): ClockSession {
  return { id, session_name: id, start_time: iso(start), duration_minutes: minutes, ...extra }
}

/** A running order of three: worship 10:00–10:30, notices 10:30–10:40, sermon 10:40–11:20. */
const plan = () => [session('worship', '10:00', 30), session('notices', '10:30', 10), session('sermon', '10:40', 40)]

function apply(sessions: ClockSession[], writes: RunWrite[]): ClockSession[] {
  return sessions.map((s) => {
    const w = writes.find((x) => x.id === s.id)
    return w ? { ...s, ...w.patch } : s
  })
}

describe('the service clock', () => {
  it('counts to the next session while one is on', () => {
    const clock = serviceClock(plan(), at('10:12'), null)
    expect(clock).toMatchObject({ to: 'session', holding: false })
    expect(clock?.current?.id).toBe('worship')
    expect(clock?.next?.id).toBe('notices')
    expect(clock?.target).toBe(at('10:30'))
  })

  it('counts the last session to the end of the service', () => {
    const clock = serviceClock(plan(), at('11:00'), null)
    expect(clock).toMatchObject({ to: 'end', target: at('11:20') })
    expect(clock?.current?.id).toBe('sermon')
  })

  it('skips a dropped session and counts to the one after it', () => {
    const sessions = plan()
    sessions[1] = { ...sessions[1], skipped_at: iso('10:05') }
    expect(serviceClock(sessions, at('10:12'), null)?.next?.id).toBe('sermon')
  })

  it('follows time added to the session that is on', () => {
    const sessions = plan()
    const later = apply(sessions, addTimePlan(sessions, 0, 5, null, at('10:12')))
    const clock = serviceClock(later, at('10:12'), null)
    expect(clock?.target).toBe(at('10:35'))
  })

  it('keeps the session on past its time when the next has not started, and says so', () => {
    const sessions = plan()
    const held = apply(sessions, holdPlan(sessions, 1, at('10:31')))
    const clock = serviceClock(held, at('10:34'), null)
    expect(clock?.current?.id).toBe('worship')
    expect(clock?.holding).toBe(true)
    // Four minutes past the time notices was due: the overrun.
    expect(clock!.target - at('10:34')).toBe(-4 * 60_000)
  })

  it('is nothing before the service and nothing once the end is called', () => {
    expect(serviceClock(plan(), at('09:30'), null)).toBeNull()
    expect(serviceClock(plan(), at('10:12'), iso('10:10'))).toBeNull()
  })

  describe('as the Countdown page reads it', () => {
    it('counts across a planned gap to the next session', () => {
      const sessions = [session('worship', '10:00', 25), session('sermon', '10:30', 30)]
      expect(serviceClock(sessions, at('10:27'), null)).toBeNull()
      const clock = serviceClock(sessions, at('10:27'), null, { gaps: true })
      expect(clock).toMatchObject({ current: null, to: 'session', target: at('10:30') })
      expect(clock?.next?.id).toBe('sermon')
    })

    it('keeps counting past the planned end until somebody calls it', () => {
      expect(serviceClock(plan(), at('11:26'), null)).toBeNull()
      const clock = serviceClock(plan(), at('11:26'), null, { gaps: true })
      expect(clock).toMatchObject({ to: 'end', target: at('11:20') })
      expect(serviceClock(plan(), at('11:26'), iso('11:25'), { gaps: true })).toBeNull()
    })
  })
})

describe('the clock face', () => {
  it('reads minutes and seconds, and hours when there are any', () => {
    expect(clockFace(245_000)).toBe('4:05')
    expect(clockFace(3_729_000)).toBe('1:02:09')
    expect(clockFace(0)).toBe('0:00')
  })

  it('carries on past zero with a plus, so the overrun shows', () => {
    expect(clockFace(-137_000)).toBe('+2:17')
    expect(clockFace(-500)).toBe('+0:00')
  })
})
