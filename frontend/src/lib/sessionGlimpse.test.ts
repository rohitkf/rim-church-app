import { describe, expect, it } from 'vitest'
import { peopleLine, sessionGlimpse, type GlimpseSession } from './sessionGlimpse'

const at = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00`).getTime()
const iso = (hhmm: string) => new Date(at(hhmm)).toISOString()

const person = (id: string, first: string, last: string, order = 0, substitute = false) => ({
  id: `a-${id}`,
  user_id: id,
  guest_id: null,
  order_index: order,
  is_substitute: substitute,
  profile: { id, first_name: first, last_name: last },
  guest: null,
})

function session(id: string, name: string, start: string, minutes: number, extra: Partial<GlimpseSession> = {}): GlimpseSession {
  return { id, session_name: name, start_time: iso(start), duration_minutes: minutes, ...extra }
}

/** Worship 10:00–10:30 (two people and a substitute), Notices 10:30–10:40, Message 10:40–11:20. */
const plan = (): GlimpseSession[] => [
  session('s1', 'Worship', '10:00', 30, {
    assignees: [person('u2', 'Anna', 'Mathew', 1), person('u1', 'Rohit', 'Kochikkat', 0), person('u3', 'Sam', 'Stand-in', 2, true)],
  }),
  session('s2', 'Notices', '10:30', 10),
  session('s3', 'Message', '10:40', 40, { assignees: [person('u4', 'Pastor', 'John')] }),
]

describe('a glimpse of a running service', () => {
  it('says what is on, who is taking it, how long is left and what is next', () => {
    const glimpse = sessionGlimpse(plan(), at('10:12'), null)
    expect(glimpse?.current?.name).toBe('Worship')
    expect(glimpse?.current?.people.join(' | ')).toMatch(/^Rohit.* \| Anna/)
    expect(glimpse?.current?.people).toHaveLength(2)
    expect(glimpse?.next).toEqual({ name: 'Notices', at: at('10:30') })
    expect(glimpse).toMatchObject({ remainingMs: 18 * 60_000, over: false, to: 'session', tone: 'plenty' })
  })

  it('turns amber and then red as the session runs out', () => {
    expect(sessionGlimpse(plan(), at('10:26'), null)?.tone).toBe('close')
    expect(sessionGlimpse(plan(), at('10:29') + 30_000, null)?.tone).toBe('out')
  })

  it('counts the last session to the end of the service', () => {
    const glimpse = sessionGlimpse(plan(), at('11:00'), null)
    expect(glimpse).toMatchObject({ to: 'end', next: null, remainingMs: 20 * 60_000 })
    expect(glimpse?.current?.name).toBe('Message')
  })

  it('shows the overrun when the next session has not started', () => {
    const sessions = plan()
    sessions[1] = { ...sessions[1], held_at: iso('10:30') }
    const glimpse = sessionGlimpse(sessions, at('10:33'), null)
    expect(glimpse).toMatchObject({ over: true, holding: true, remainingMs: -3 * 60_000, tone: 'out' })
    expect(glimpse?.current?.name).toBe('Worship')
    expect(glimpse?.next?.name).toBe('Notices')
  })

  it('shows the overrun past the end when the service is marked not ended', () => {
    const glimpse = sessionGlimpse(plan(), at('11:27'), null, true)
    expect(glimpse).toMatchObject({ over: true, holding: true, to: 'end', remainingMs: -7 * 60_000 })
    expect(glimpse?.current?.name).toBe('Message')
  })

  it('is nothing before the service, with no running order, and once the end is called', () => {
    expect(sessionGlimpse(plan(), at('09:00'), null)).toBeNull()
    expect(sessionGlimpse([], at('10:12'), null)).toBeNull()
    expect(sessionGlimpse(plan(), at('10:50'), iso('10:45'))).toBeNull()
  })

  it('says so when nobody is on the session', () => {
    const glimpse = sessionGlimpse(plan(), at('10:33'), null)
    expect(glimpse?.current).toEqual({ name: 'Notices', people: [] })
    expect(peopleLine(glimpse!.current!.people)).toBe('Nobody on it yet')
  })
})

describe('the people on a line', () => {
  it('names two and counts the rest', () => {
    expect(peopleLine(['Rohit K.'])).toBe('Rohit K.')
    expect(peopleLine(['Rohit K.', 'Anna M.'])).toBe('Rohit K., Anna M.')
    expect(peopleLine(['Rohit K.', 'Anna M.', 'Sam S.', 'Jo P.'])).toBe('Rohit K., Anna M. and 2 more')
  })
})
