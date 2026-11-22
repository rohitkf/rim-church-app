import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CountdownPage } from './CountdownPage'

/*
 * The Countdown page: the running order's clock, large. It counts to the
 * next session (or the end), and past zero keeps counting with a minus
 * (on this page only: lib/serviceClock `countdownFace`).
 */

const SUNDAY = '2026-09-06'
const db = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }))

vi.mock('../lib/supabaseClient', () => {
  const chain = (table: string): unknown => {
    const result = () => Promise.resolve({ data: db.rows[table] ?? [], error: null })
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, key) => {
          if (key === 'then') return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
          return () => proxy
        },
      },
    )
    return proxy
  }
  return { supabase: { from: (table: string) => chain(table) } }
})
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: false, isSuperAdmin: false }),
}))
vi.mock('../lib/monthGrid', async (original) => ({
  ...(await original<typeof import('../lib/monthGrid')>()),
  todayIso: () => SUNDAY,
}))

const at = (hhmm: string) => new Date(`${SUNDAY}T${hhmm}:00`)
function session(id: string, name: string, start: string, minutes: number, order: number, extra = {}) {
  return {
    id,
    service_id: 'svc',
    order_index: order,
    session_name: name,
    start_time: at(start).toISOString(),
    duration_minutes: minutes,
    ...extra,
  }
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CountdownPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  db.rows = {
    services: [{ id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: null }],
    service_sessions: [
      session('s1', 'Worship', '10:00', 30, 0),
      session('s2', 'Notices', '10:30', 10, 1),
      session('s3', 'Sermon', '10:40', 40, 2),
    ],
  }
})
afterEach(() => vi.useRealTimers())

describe('the Countdown page', () => {
  it('counts to the next session while one is on', async () => {
    vi.setSystemTime(new Date(at('10:25').getTime() + 30_000))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('4:30')
    expect(screen.getByText('Worship')).toBeInTheDocument()
    expect(screen.getByText(/Until Notices/)).toBeInTheDocument()
  })

  it('keeps counting past zero, with a minus, when the next session has not started', async () => {
    db.rows.service_sessions = [
      session('s1', 'Worship', '10:00', 30, 0),
      session('s2', 'Notices', '10:30', 10, 1, { held_at: at('10:30').toISOString() }),
      session('s3', 'Sermon', '10:40', 40, 2),
    ]
    vi.setSystemTime(at('10:33'))
    show()
    const timer = await screen.findByRole('timer')
    expect(timer).toHaveTextContent('−3:00')
    expect(timer).toHaveAccessibleName('Running 3:00 over')
    expect(screen.getByText('Notices has not started yet.')).toBeInTheDocument()
  })

  it('follows time added to a session: the next one moves, and so does the clock', async () => {
    db.rows.service_sessions = [
      session('s1', 'Worship', '10:00', 30, 0, { added_minutes: 5 }),
      session('s2', 'Notices', '10:35', 10, 1),
      session('s3', 'Sermon', '10:45', 40, 2),
    ]
    vi.setSystemTime(at('10:25'))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('10:00')
  })

  it('counts the last session to the end, and past it until the end is called', async () => {
    vi.setSystemTime(at('11:25'))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('−5:00')
    expect(screen.getByText(/Over the planned end/)).toBeInTheDocument()
  })

  it('shows a blank session clock before the service starts: the countdown to it is the section below', async () => {
    vi.setSystemTime(at('09:00'))
    show()
    expect(await screen.findByText('--:--:--')).toBeInTheDocument()
    expect(screen.getByText('No service running')).toBeInTheDocument()
    // The only clock running is the one in the Service section, to the start.
    const timers = screen.getAllByRole('timer')
    expect(timers).toHaveLength(1)
    expect(within(screen.getByRole('region', { name: 'Service' })).getByRole('timer')).toBe(timers[0])
  })

  it('shows a blank clock once the service has been called over', async () => {
    db.rows.services = [{ id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: at('11:10').toISOString() }]
    vi.setSystemTime(at('11:15'))
    show()
    expect(await screen.findByText('--:--:--')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('is green with plenty of time, amber as the end comes close, red for the last of it and past zero', async () => {
    // Worship runs 10:00–10:30: amber for its last five minutes, red for its last one.
    vi.setSystemTime(at('10:05'))
    const first = show()
    expect(await screen.findByRole('timer')).toHaveAttribute('data-tone', 'plenty')
    expect(screen.getByRole('timer')).toHaveClass('text-accent-green-soft')
    first.unmount()

    vi.setSystemTime(at('10:26'))
    const second = show()
    expect(await screen.findByRole('timer')).toHaveClass('text-accent-orange-soft')
    expect(screen.getByText('Coming to the end.')).toBeInTheDocument()
    second.unmount()

    vi.setSystemTime(new Date(at('10:29').getTime() + 30_000))
    const third = show()
    expect(await screen.findByRole('timer')).toHaveClass('text-error')
    expect(screen.getByText('Time is nearly up.')).toBeInTheDocument()
    third.unmount()

    vi.setSystemTime(at('11:25'))
    show()
    expect(await screen.findByRole('timer')).toHaveClass('text-error')
  })

  it('says the service has not ended when somebody has marked it so', async () => {
    db.rows.services = [
      { id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: null, end_held_at: at('11:19').toISOString() },
    ]
    vi.setSystemTime(at('11:27'))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('−7:00')
    expect(screen.getByText('The service has not ended yet — Sermon is still running.')).toBeInTheDocument()
  })

  it('blinks the number once it is counting up, and holds it steady while it is counting down', async () => {
    vi.setSystemTime(at('10:12'))
    const before = show()
    expect(await screen.findByRole('timer')).not.toHaveClass('blink-over')
    before.unmount()

    // The last minute is red but still counting down: steady.
    vi.setSystemTime(new Date(at('10:29').getTime() + 30_000))
    const close = show()
    expect(await screen.findByRole('timer')).not.toHaveClass('blink-over')
    close.unmount()

    // Past the planned end: counting up.
    vi.setSystemTime(at('11:25'))
    show()
    const timer = await screen.findByRole('timer')
    expect(timer).toHaveTextContent('−5:00')
    expect(timer).toHaveClass('blink-over')
  })
})

/*
 * A session over an hour long puts an hour on the number: two characters
 * more, which sized from the screen alone ran out of the card on a phone.
 */
describe('the Countdown’s number and its card', () => {
  const sizeOf = () => screen.getByRole('timer').style.fontSize

  it('is held to what its card fits', async () => {
    vi.setSystemTime(new Date(at('10:25').getTime() + 30_000))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('4:30')
    expect(sizeOf()).toBe('min(clamp(4.5rem, 22vw, 13rem), 32cqi)')
    expect(screen.getByRole('timer')).toHaveClass('whitespace-nowrap')
    // The card is what it is measured against.
    expect(screen.getByRole('timer').closest('section')).toHaveClass('@container')
  })

  it('is smaller with an hour on it', async () => {
    db.rows.service_sessions = [session('s1', 'Message', '10:00', 120, 0), session('s2', 'Close', '12:00', 10, 1)]
    vi.setSystemTime(new Date(at('10:25').getTime() + 30_000))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('1:34:30')
    expect(sizeOf()).toBe('min(clamp(4.5rem, 22vw, 13rem), 22.8cqi)')
  })

  it('holds the blank clock to its card too', async () => {
    vi.setSystemTime(at('08:00'))
    show()
    const blank = await screen.findByLabelText('No service is running')
    expect(blank.style.fontSize).toBe('min(clamp(3.5rem, 16vw, 10rem), 20cqi)')
  })
})

/*
 * Under the number, the same reading as one number of minutes: what gets
 * held up on a card at the back, with no hour to work out first.
 */
describe('the minutes under the Countdown’s number', () => {
  it('rounds up while counting down', async () => {
    vi.setSystemTime(new Date(at('10:25').getTime() + 30_000))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('4:30')
    expect(screen.getByText('5 minutes remaining')).toBeInTheDocument()
  })

  it('counts an hour as sixty', async () => {
    db.rows.service_sessions = [session('s1', 'Message', '10:00', 120, 0), session('s2', 'Close', '12:00', 10, 1)]
    vi.setSystemTime(new Date(at('10:25').getTime() + 30_000))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('1:34:30')
    expect(screen.getByText('95 minutes remaining')).toBeInTheDocument()
  })

  it('says how many minutes over once it is counting up', async () => {
    db.rows.service_sessions = [
      session('s1', 'Worship', '10:00', 30, 0),
      session('s2', 'Notices', '10:30', 10, 1, { held_at: at('10:30').toISOString() }),
      session('s3', 'Sermon', '10:40', 40, 2),
    ]
    vi.setSystemTime(new Date(at('10:32').getTime() + 17_000))
    show()
    expect(await screen.findByRole('timer')).toHaveTextContent('−2:17')
    expect(screen.getByText('2 minutes over')).toBeInTheDocument()
  })

  it('has none on the blank clock', async () => {
    vi.setSystemTime(at('08:00'))
    show()
    await screen.findByLabelText('No service is running')
    expect(screen.queryByText(/minutes? (remaining|over)/)).toBeNull()
  })
})

describe('a session’s note (0316)', () => {
  // The Owner, the day notes arrived: "No need to show the note in countdown page."
  it('is not on the Countdown: this page is the clock', async () => {
    db.rows.service_sessions = [
      session('s1', 'Worship', '10:00', 30, 0, { note: 'Communion follows. Elements on the table by 10:40.' }),
      session('s2', 'Notices', '10:30', 10, 1),
    ]
    vi.setSystemTime(at('10:10'))
    show()
    await screen.findByRole('timer')
    expect(screen.getByText('Worship')).toBeInTheDocument()
    expect(screen.queryByText(/Communion follows/)).toBeNull()
    expect(screen.queryByText('Note')).toBeNull()
  })
})

describe('the sign on the Countdown’s number', () => {
  // The Owner: "instead of showing +, show -. This is only for countdown page."
  it('is a minus past zero, never a plus, and none while counting down', async () => {
    db.rows.service_sessions = [session('s1', 'Worship', '10:00', 30, 0), session('s2', 'Notices', '10:30', 10, 1, { held_at: at('10:30').toISOString() })]
    vi.setSystemTime(new Date(at('10:32').getTime() + 17_000))
    const over = show()
    const timer = await screen.findByRole('timer')
    expect(timer.textContent).toBe('−2:17')
    expect(timer.textContent).not.toContain('+')
    // Said aloud it is words, with no sign to read out.
    expect(timer).toHaveAccessibleName('Running 2:17 over')
    // The line under it says "over" in words, as it always has.
    expect(screen.getByText('2 minutes over')).toBeInTheDocument()
    over.unmount()
    vi.setSystemTime(at('10:10'))
    show()
    expect((await screen.findByRole('timer')).textContent).toBe('20:00')
  })
})

/*
 * The second section: the service itself. Before one starts it counts to
 * that start; once one is running it counts to the one after. The Owner:
 * "the countdown page has 2 sections: one is to show countdown of
 * sessions. Below is another section showing countdown until service
 * starts or next service starts."
 */
describe('the Countdown’s second section, for the service', () => {
  const on = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString()
  const NEXT_SUNDAY = '2026-09-13'
  const later = (id: string, service: string, day: string, hhmm: string) => session(id, 'Worship', '10:00', 30, 0, { service_id: service, start_time: on(day, hhmm) })

  it('counts to the service’s start before it begins, and names it', async () => {
    vi.setSystemTime(at('09:00'))
    show()
    const section = within(await screen.findByRole('region', { name: 'Service' }))
    expect(section.getByRole('timer')).toHaveTextContent('1:00:00')
    expect(section.getByRole('timer')).toHaveAccessibleName('1 hour until English Service starts')
    expect(section.getByText('English Service')).toBeInTheDocument()
    expect(section.getByText(/starts in/)).toBeInTheDocument()
    // When that is: the time alone, the day not being in question.
    expect(section.getByText(/^Starts/)).toHaveTextContent(/^Starts · 10:00/)
    expect(section.getByRole('link', { name: 'Running order' })).toHaveAttribute('href', '/service-planner/svc')
    // Not called "next" while nothing is on.
    expect(screen.queryByRole('region', { name: 'Next service' })).toBeNull()
  })

  it('sits under the session clock, not above it', async () => {
    vi.setSystemTime(at('09:00'))
    show()
    const blank = await screen.findByText('--:--:--')
    const section = screen.getByRole('region', { name: 'Service' })
    expect(blank.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('counts to the next service once one is running: a later one the same day', async () => {
    db.rows.services = [
      { id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: null },
      { id: 'mal', date: SUNDAY, service_type: 'Malayalam Service', ended_at: null },
    ]
    db.rows.service_sessions = [
      session('s1', 'Worship', '10:00', 30, 0),
      session('s2', 'Notices', '10:30', 10, 1),
      later('m1', 'mal', SUNDAY, '12:00'),
    ]
    vi.setSystemTime(at('10:10'))
    show()
    const section = within(await screen.findByRole('region', { name: 'Next service' }))
    expect(section.getByRole('timer')).toHaveTextContent('1:50:00')
    expect(section.getByText('Malayalam Service')).toBeInTheDocument()
    expect(section.getByRole('link', { name: 'Running order' })).toHaveAttribute('href', '/service-planner/mal')
    // The session clock above is still its own number.
    const timers = screen.getAllByRole('timer')
    expect(timers).toHaveLength(2)
    expect(timers[0]).toHaveTextContent('20:00')
    // And the section is not called just "Service" while one is on.
    expect(screen.queryByRole('region', { name: 'Service' })).toBeNull()
  })

  it('counts in days to next week’s, when that is what comes next', async () => {
    db.rows.services = [
      { id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: null },
      { id: 'nxt', date: NEXT_SUNDAY, service_type: 'English Service', ended_at: null },
    ]
    db.rows.service_sessions = [session('s1', 'Worship', '10:00', 30, 0), later('n1', 'nxt', NEXT_SUNDAY, '10:00')]
    vi.setSystemTime(at('10:10'))
    show()
    const section = within(await screen.findByRole('region', { name: 'Next service' }))
    expect(section.getByRole('timer')).toHaveTextContent('6d 23:50:00')
    expect(section.getByRole('timer')).toHaveAccessibleName('6 days 23 hours until English Service starts')
    // A week off, the day is said with the time.
    expect(section.getByText(/^Starts/)).toHaveTextContent(/^Starts .*13.* · 10:00/)
    expect(section.getByRole('link', { name: 'Running order' })).toHaveAttribute('href', '/service-planner/nxt')
  })

  it('says nothing is planned after this one, when nothing is', async () => {
    vi.setSystemTime(at('10:10'))
    show()
    const section = within(await screen.findByRole('region', { name: 'Next service' }))
    expect(section.getByText('Nothing is planned after this one yet.')).toBeInTheDocument()
    expect(section.queryByRole('timer')).toBeNull()
  })

  it('says no service is planned, when there is none at all', async () => {
    db.rows.services = []
    db.rows.service_sessions = []
    vi.setSystemTime(at('08:00'))
    show()
    const section = within(await screen.findByRole('region', { name: 'Service' }))
    expect(section.getByText('No service with a running order is planned yet.')).toBeInTheDocument()
  })

  it('passes over a service that has no running order, and one that is over', async () => {
    db.rows.services = [
      { id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: at('11:10').toISOString() },
      { id: 'bare', date: SUNDAY, service_type: 'Prayer Meeting', ended_at: null },
      { id: 'nxt', date: NEXT_SUNDAY, service_type: 'Malayalam Service', ended_at: null },
    ]
    db.rows.service_sessions = [session('s1', 'Worship', '10:00', 30, 0), later('n1', 'nxt', NEXT_SUNDAY, '10:00')]
    vi.setSystemTime(at('11:15'))
    show()
    const section = within(await screen.findByRole('region', { name: 'Service' }))
    expect(section.getByText('Malayalam Service')).toBeInTheDocument()
    expect(section.queryByText('Prayer Meeting')).toBeNull()
  })

  it('moves on to the one after at the moment a service starts', async () => {
    db.rows.services = [
      { id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: null },
      { id: 'nxt', date: NEXT_SUNDAY, service_type: 'Malayalam Service', ended_at: null },
    ]
    db.rows.service_sessions = [session('s1', 'Worship', '10:00', 30, 0), later('n1', 'nxt', NEXT_SUNDAY, '10:00')]
    vi.setSystemTime(new Date(at('09:59').getTime() + 58_000))
    const before = show()
    expect(within(await screen.findByRole('region', { name: 'Service' })).getByText('English Service')).toBeInTheDocument()
    before.unmount()
    vi.setSystemTime(new Date(at('10:00').getTime() + 1_000))
    show()
    expect(within(await screen.findByRole('region', { name: 'Next service' })).getByText('Malayalam Service')).toBeInTheDocument()
  })

  it('is sized to its card, and has no minus or plus: nothing runs late there', async () => {
    vi.setSystemTime(at('09:00'))
    show()
    const timer = within(await screen.findByRole('region', { name: 'Service' })).getByRole('timer')
    expect(timer.style.fontSize).toMatch(/^min\(clamp\(3rem, 15vw, 8\.5rem\), [\d.]+cqi\)$/)
    expect(timer.textContent).not.toMatch(/[+−-]/)
    expect(timer).toHaveClass('text-accent-blue-soft')
  })
})
