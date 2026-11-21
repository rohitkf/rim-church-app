import { describe, expect, it } from 'vitest'
import { type ClockSession, clockFace, clockSize, clockTone, serviceClock } from './serviceClock'
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

describe('a service marked not ended', () => {
  it('keeps the last session on past its time, counting to the end it missed', () => {
    const clock = serviceClock(plan(), at('11:27'), null, { endHeld: true })
    expect(clock).toMatchObject({ to: 'end', target: at('11:20'), holding: true })
    expect(clock?.current?.id).toBe('sermon')
    expect(clockFace(clock!.target - at('11:27'))).toBe('+7:00')
  })

  it('is the rail’s nothing without it: past the planned end the service reads as over', () => {
    expect(serviceClock(plan(), at('11:27'), null)).toBeNull()
  })

  it('says it is holding before the end too, so the clock counts on through zero', () => {
    expect(serviceClock(plan(), at('11:10'), null, { endHeld: true })).toMatchObject({ to: 'end', holding: true })
    expect(serviceClock(plan(), at('11:10'), null)).toMatchObject({ to: 'end', holding: false })
  })

  it('changes nothing for a session that is not the last', () => {
    expect(serviceClock(plan(), at('10:12'), null, { endHeld: true })).toMatchObject({ to: 'session', holding: false })
  })

  it('stops the moment the end is called', () => {
    expect(serviceClock(plan(), at('11:27'), iso('11:26'), { endHeld: true })).toBeNull()
  })

  it('counts against the last session that runs, not one that was dropped', () => {
    const sessions = [...plan(), session('extra', '11:20', 10, { skipped_at: iso('10:00') })]
    const clock = serviceClock(sessions, at('11:25'), null, { endHeld: true })
    expect(clock?.current?.id).toBe('sermon')
    expect(clock?.target).toBe(at('11:20'))
  })
})

describe('the colour of the clock', () => {
  const min = 60_000

  it('is green with plenty left, amber when close, red at the end and past it', () => {
    // A forty-minute message: amber for the last five minutes, red for the last one.
    expect(clockTone(20 * min, 40 * min)).toBe('plenty')
    expect(clockTone(5 * min + 1000, 40 * min)).toBe('plenty')
    expect(clockTone(5 * min, 40 * min)).toBe('close')
    expect(clockTone(min + 1000, 40 * min)).toBe('close')
    expect(clockTone(min, 40 * min)).toBe('out')
    expect(clockTone(0, 40 * min)).toBe('out')
    expect(clockTone(-3 * min, 40 * min)).toBe('out')
  })

  it('goes by a share of a short session, so a two-minute notice is not amber from its start', () => {
    expect(clockTone(2 * min, 2 * min)).toBe('plenty')
    expect(clockTone(31_000, 2 * min)).toBe('plenty')
    expect(clockTone(30_000, 2 * min)).toBe('close')
    expect(clockTone(12_000, 2 * min)).toBe('out')
  })

  it('falls back on five minutes and one minute when there is no length to take a share of', () => {
    expect(clockTone(6 * min)).toBe('plenty')
    expect(clockTone(4 * min, null)).toBe('close')
    expect(clockTone(50_000, 0)).toBe('out')
  })
})

/*
 * 1:12:55 is two characters longer than 12:55, and sized from the screen
 * alone it ran out of its card on a phone.
 */
describe('how big the clock is drawn', () => {
  const widest = 'clamp(4.5rem, 22vw, 13rem)'
  const share = (face: string) => Number(/, ([\d.]+)cqi\)$/.exec(clockSize(face, widest))?.[1])

  it('is never more than it was, and never wider than its card', () => {
    expect(clockSize('12:55', widest)).toBe('min(clamp(4.5rem, 22vw, 13rem), 32cqi)')
  })

  it('steps down when an hour comes onto it, and again for the plus of an overrun', () => {
    expect(share('1:12:55')).toBeLessThan(share('12:55'))
    expect(share('+1:12:55')).toBeLessThan(share('1:12:55'))
    // Every character still fits: about 0.62em each, in a hundred hundredths of the card.
    for (const face of ['4:05', '12:55', '+12:55', '1:12:55', '+1:12:55', '--:--:--']) {
      expect(share(face) * 0.62 * face.length).toBeLessThanOrEqual(100)
    }
  })

  it('does not change size as the minutes go from one figure to two', () => {
    expect(share('9:59')).toBe(share('10:00'))
    expect(share('0:00')).toBe(share('+0:01'))
  })
})
