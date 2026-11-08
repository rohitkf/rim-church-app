import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CountdownPage } from './CountdownPage'

/*
 * The Countdown page: the running order's clock, large. It counts to the
 * next session (or the end), and past zero keeps counting with a plus.
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
  render(
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

  it('keeps counting past zero, with a plus, when the next session has not started', async () => {
    db.rows.service_sessions = [
      session('s1', 'Worship', '10:00', 30, 0),
      session('s2', 'Notices', '10:30', 10, 1, { held_at: at('10:30').toISOString() }),
      session('s3', 'Sermon', '10:40', 40, 2),
    ]
    vi.setSystemTime(at('10:33'))
    show()
    const timer = await screen.findByRole('timer')
    expect(timer).toHaveTextContent('+3:00')
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
    expect(await screen.findByRole('timer')).toHaveTextContent('+5:00')
    expect(screen.getByText(/Over the planned end/)).toBeInTheDocument()
  })

  it('shows a blank clock before the service starts, not a countdown to it', async () => {
    vi.setSystemTime(at('09:00'))
    show()
    expect(await screen.findByText('--:--:--')).toBeInTheDocument()
    expect(screen.getByText('No service running')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.queryByText(/English Service/)).toBeNull()
  })

  it('shows a blank clock once the service has been called over', async () => {
    db.rows.services = [{ id: 'svc', date: SUNDAY, service_type: 'English Service', ended_at: at('11:10').toISOString() }]
    vi.setSystemTime(at('11:15'))
    show()
    expect(await screen.findByText('--:--:--')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
  })
})
