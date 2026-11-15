import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionGlimpse } from './SessionGlimpse'
import type { GlimpseSession } from '../lib/sessionGlimpse'

/*
 * The glimpse of what is on, inside a service's card on the Dashboard: the
 * session, who is taking it, and its time left or its overrun.
 */

const at = (hhmm: string) => new Date(`2026-09-06T${hhmm}:00`)
const person = (id: string, first: string, last: string) => ({
  id: `a-${id}`,
  user_id: id,
  guest_id: null,
  order_index: 0,
  is_substitute: false,
  profile: { id, first_name: first, last_name: last },
  guest: null,
})
const session = (id: string, name: string, start: string, minutes: number, extra: Partial<GlimpseSession> = {}): GlimpseSession => ({
  id,
  session_name: name,
  start_time: at(start).toISOString(),
  duration_minutes: minutes,
  ...extra,
})
/** Worship 10:00–10:30, Message 10:30–11:10. */
const plan = (): GlimpseSession[] => [
  session('s1', 'Worship', '10:00', 30, { assignees: [person('u1', 'Rohit', 'Kochikkat')] }),
  session('s2', 'Message', '10:30', 40),
]

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe('the glimpse of a running service', () => {
  it('names the session, who is taking it, the time left and what is next', () => {
    vi.setSystemTime(at('10:12'))
    render(<SessionGlimpse sessions={plan()} />)
    expect(screen.getByText('Worship')).toBeInTheDocument()
    expect(screen.getByText('Rohit Kochikkat')).toBeInTheDocument()
    const timer = screen.getByRole('timer')
    expect(timer).toHaveTextContent('18:00')
    expect(timer).toHaveAccessibleName('18:00 left')
    expect(timer).toHaveClass('text-accent-green-soft')
    expect(screen.getByText('Message')).toBeInTheDocument()
  })

  it('goes amber and then red as the session runs out', () => {
    vi.setSystemTime(at('10:26'))
    const first = render(<SessionGlimpse sessions={plan()} />)
    expect(screen.getByRole('timer')).toHaveClass('text-accent-orange-soft')
    first.unmount()
    vi.setSystemTime(new Date(at('10:29').getTime() + 30_000))
    render(<SessionGlimpse sessions={plan()} />)
    expect(screen.getByRole('timer')).toHaveClass('text-error')
  })

  it('shows the overrun, with a plus, when the next session has not started', () => {
    const sessions = plan()
    sessions[1] = { ...sessions[1], held_at: at('10:30').toISOString() }
    vi.setSystemTime(at('10:34'))
    render(<SessionGlimpse sessions={sessions} />)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveTextContent('+4:00')
    expect(timer).toHaveAccessibleName('4:00 over')
    expect(screen.getByText(/Waiting to start/)).toBeInTheDocument()
  })

  it('shows the overrun past the planned end for a service marked not ended', () => {
    vi.setSystemTime(at('11:17'))
    render(<SessionGlimpse sessions={plan()} endHeld />)
    expect(screen.getByRole('timer')).toHaveTextContent('+7:00')
    expect(screen.getByText('Not ended yet — past the planned end.')).toBeInTheDocument()
  })

  it('says nobody is on a session that has nobody', () => {
    vi.setSystemTime(at('10:40'))
    render(<SessionGlimpse sessions={plan()} />)
    expect(screen.getByText('Nobody on it yet')).toBeInTheDocument()
    expect(screen.getByText('Then the end of the service.')).toBeInTheDocument()
  })

  it('is a few words on the service’s own row', () => {
    vi.setSystemTime(at('10:12'))
    render(<SessionGlimpse variant="line" sessions={plan()} />)
    expect(screen.getByText('Worship')).toBeInTheDocument()
    expect(screen.getByLabelText('18:00 left')).toHaveTextContent('18:00 left')
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('draws nothing before the service starts or once the end is called', () => {
    vi.setSystemTime(at('09:00'))
    const before = render(<SessionGlimpse sessions={plan()} />)
    expect(before.container).toBeEmptyDOMElement()
    before.unmount()
    vi.setSystemTime(at('10:50'))
    const after = render(<SessionGlimpse sessions={plan()} endedAt={at('10:45').toISOString()} />)
    expect(after.container).toBeEmptyDOMElement()
  })
})
