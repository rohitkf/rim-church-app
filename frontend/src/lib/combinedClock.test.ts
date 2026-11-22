import { describe, expect, it } from 'vitest'
import { combinedClock, namesJoined, sameTakers, type TakenSession } from './combinedClock'
import { serviceClock } from './serviceClock'

const at = (hhmm: string) => new Date(`2026-11-22T${hhmm}:00`).getTime()
const iso = (hhmm: string) => new Date(at(hhmm)).toISOString()

const person = (id: string, mark: { is_substitute?: boolean; is_translator?: boolean } = {}) => ({
  id: `a-${id}-${JSON.stringify(mark)}`,
  user_id: id.startsWith('g') ? null : id,
  guest_id: id.startsWith('g') ? id : null,
  order_index: 0,
  is_substitute: false,
  ...mark,
  profile: id.startsWith('g') ? null : { id, first_name: id, last_name: 'T' },
  guest: id.startsWith('g') ? { id, name: id, title: null, note: null } : null,
})

function session(id: string, name: string, start: string, minutes: number, who: ReturnType<typeof person>[], extra: Partial<TakenSession> = {}): TakenSession {
  return { id, session_name: name, start_time: iso(start), duration_minutes: minutes, assignees: who, ...extra }
}

/** Worship 10:00 (Anna), Message 10:30 and Message 1 11:10 (both the guest speaker), Notices 11:40 (Ben), ending 11:50. */
const plan = (): TakenSession[] => [
  session('s1', 'Worship', '10:00', 30, [person('anna')]),
  session('s2', 'Message', '10:30', 40, [person('g-speaker')]),
  session('s3', 'Message 1', '11:10', 30, [person('g-speaker')]),
  session('s4', 'Notices', '11:40', 10, [person('ben')]),
]
const clockAt = (sessions: TakenSession[], hhmm: string, endHeld = false) => {
  const clock = serviceClock(sessions, at(hhmm), null, { gaps: true, endHeld })!
  return combinedClock(sessions, clock, endHeld)
}

describe('whether two sessions are taken by the same people', () => {
  it('is so when exactly the same people take both, in any order', () => {
    const a = session('a', 'A', '10:00', 10, [person('anna'), person('ben')])
    const b = session('b', 'B', '10:10', 10, [person('ben'), person('anna')])
    expect(sameTakers(a, b)).toBe(true)
  })

  it('is not so when one has somebody the other has not', () => {
    const a = session('a', 'A', '10:00', 10, [person('anna')])
    const b = session('b', 'B', '10:10', 10, [person('anna'), person('ben')])
    expect(sameTakers(a, b)).toBe(false)
    expect(sameTakers(b, a)).toBe(false)
  })

  it('goes by who takes it, not who stands in or translates', () => {
    const a = session('a', 'A', '10:00', 10, [person('anna'), person('ben', { is_substitute: true })])
    const b = session('b', 'B', '10:10', 10, [person('anna'), person('cara', { is_translator: true })])
    expect(sameTakers(a, b)).toBe(true)
    // A substitute on one is not the person taking the other.
    const c = session('c', 'C', '10:20', 10, [person('ben')])
    expect(sameTakers(a, c)).toBe(false)
  })

  it('tells a member from a guest', () => {
    expect(sameTakers(session('a', 'A', '10:00', 10, [person('g-1')]), session('b', 'B', '10:10', 10, [person('g-1')]))).toBe(true)
    expect(sameTakers(session('a', 'A', '10:00', 10, [person('g-1')]), session('b', 'B', '10:10', 10, [person('1')]))).toBe(false)
  })

  it('never joins two sessions nobody is on', () => {
    expect(sameTakers(session('a', 'A', '10:00', 10, []), session('b', 'B', '10:10', 10, []))).toBe(false)
    expect(sameTakers({ ...session('a', 'A', '10:00', 10, []), assignees: undefined }, session('b', 'B', '10:10', 10, []))).toBe(false)
  })
})

describe('the Countdown’s clock, counting the same people’s sessions as one', () => {
  it('counts a session somebody takes alone to the next one, as before', () => {
    const { clock, joined } = clockAt(plan(), '10:10')
    expect(clock.current?.session_name).toBe('Worship')
    expect(clock.target).toBe(at('10:30'))
    expect(joined.map((s) => s.session_name)).toEqual(['Worship'])
  })

  it('counts on through the next session when the same person takes it', () => {
    const { clock, joined, from } = clockAt(plan(), '10:40')
    expect(clock.current?.session_name).toBe('Message')
    // Not to 11:10, where Message 1 begins, but to 11:40, where somebody else takes over.
    expect(clock.target).toBe(at('11:40'))
    expect(clock.next?.session_name).toBe('Notices')
    expect(clock.to).toBe('session')
    expect(joined.map((s) => s.session_name)).toEqual(['Message', 'Message 1'])
    expect(from).toBe(at('10:30'))
  })

  it('is the second session’s own clock once the first is over, still measured from where the stretch began', () => {
    const { clock, joined, from } = clockAt(plan(), '11:20')
    expect(clock.current?.session_name).toBe('Message 1')
    expect(clock.target).toBe(at('11:40'))
    expect(joined.map((s) => s.session_name)).toEqual(['Message 1'])
    expect(from).toBe(at('10:30'))
  })

  it('joins three in a row, and however many there are', () => {
    const sessions = plan()
    sessions[3] = session('s4', 'Q&A', '11:40', 10, [person('g-speaker')])
    const { clock, joined } = clockAt(sessions, '10:40')
    expect(joined.map((s) => s.session_name)).toEqual(['Message', 'Message 1', 'Q&A'])
    // Nothing after them: the end of the service.
    expect(clock.to).toBe('end')
    expect(clock.next).toBeNull()
    expect(clock.target).toBe(at('11:50'))
  })

  it('does not join across a session somebody else takes', () => {
    const sessions = [
      session('s1', 'Message', '10:00', 30, [person('g-speaker')]),
      session('s2', 'Song', '10:30', 5, [person('anna')]),
      session('s3', 'Message 1', '10:35', 30, [person('g-speaker')]),
    ]
    const { clock, joined } = clockAt(sessions, '10:10')
    expect(clock.target).toBe(at('10:30'))
    expect(joined).toHaveLength(1)
  })

  it('passes over a session that has been skipped', () => {
    const sessions = plan()
    sessions.splice(2, 0, session('sx', 'Song', '11:10', 0, [person('anna')], { skipped_at: iso('09:00') }))
    const { clock, joined } = clockAt(sessions, '10:40')
    expect(joined.map((s) => s.session_name)).toEqual(['Message', 'Message 1'])
    expect(clock.target).toBe(at('11:40'))
  })

  it('counts time added to either session, because it counts to where the next one starts', () => {
    const sessions = plan()
    // Ten minutes granted to Message 1: Notices now starts at 11:50.
    sessions[2] = { ...sessions[2], duration_minutes: 40, added_minutes: 10 }
    sessions[3] = { ...sessions[3], start_time: iso('11:50') }
    expect(clockAt(sessions, '10:40').clock.target).toBe(at('11:50'))
  })

  it('is not running over when the second of the two has only been marked not started', () => {
    const sessions = plan()
    sessions[2] = { ...sessions[2], held_at: iso('11:10') }
    // 11:15: Message's own time is up and Message 1 is held. The same person is still going.
    const { clock, joined } = clockAt(sessions, '11:15')
    expect(clock.current?.session_name).toBe('Message')
    expect(clock.target).toBe(at('11:40'))
    expect(clock.holding).toBe(false)
    expect(joined.map((s) => s.session_name)).toEqual(['Message', 'Message 1'])
  })

  it('is held on by the session after the stretch, when that one has not started', () => {
    const sessions = plan()
    sessions[3] = { ...sessions[3], held_at: iso('11:40') }
    const { clock } = clockAt(sessions, '11:45')
    expect(clock.current?.session_name).toBe('Message 1')
    expect(clock.target).toBe(at('11:40'))
    expect(clock.holding).toBe(true)
  })

  it('carries “Not ended” when the stretch runs to the end of the service', () => {
    const sessions = plan().slice(0, 3)
    const { clock } = clockAt(sessions, '10:40', true)
    expect(clock.to).toBe('end')
    expect(clock.target).toBe(at('11:40'))
    expect(clock.holding).toBe(true)
  })

  it('leaves a gap between sessions alone', () => {
    const sessions = [session('s1', 'A', '10:00', 10, [person('anna')]), session('s2', 'B', '10:30', 10, [person('anna')])]
    // 10:15: A is over and B has not begun. Nothing is on, so there is nothing to join.
    const clock = serviceClock(sessions, at('10:15'), null, { gaps: true })!
    expect(clock.current).toBeNull()
    expect(combinedClock(sessions, clock)).toEqual({ clock, joined: [], from: null })
  })

  it('does not join sessions nobody is on', () => {
    const sessions = [session('s1', 'A', '10:00', 10, []), session('s2', 'B', '10:10', 10, [])]
    const { clock, joined } = clockAt(sessions, '10:05')
    expect(clock.target).toBe(at('10:10'))
    expect(joined).toHaveLength(1)
  })
})

describe('the sessions counted with the one that is on, said', () => {
  it('reads as a list', () => {
    expect(namesJoined(['Message 1'])).toBe('Message 1')
    expect(namesJoined(['Message 1', 'Q&A'])).toBe('Message 1 and Q&A')
    expect(namesJoined(['Message 1', 'Q&A', 'Closing'])).toBe('Message 1, Q&A and Closing')
    expect(namesJoined([])).toBe('')
  })
})
