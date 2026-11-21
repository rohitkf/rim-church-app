import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServicePlannerPage } from './ServicePlannerPage'

/*
 * The last session has nothing after it to hold it on, so the service has
 * a hold of its own: Not ended (0292). With it the closing session stays
 * on past its time and its overrun counts until End service, which then
 * says how far over it ran.
 */

const SUNDAY = '2026-09-06'
const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  updates: [] as { table: string; patch: Record<string, unknown> }[],
}))

// Every read: a chain that ends in the table's rows, whatever it was asked.
// An update is remembered, and carried out on the table's first row.
vi.mock('../lib/supabaseClient', () => {
  const chain = (table: string): unknown => {
    const result = () => Promise.resolve({ data: db.rows[table] ?? [], error: null })
    const one = () => Promise.resolve({ data: (db.rows[table] ?? [])[0] ?? null, error: null })
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_t, key) => {
          if (key === 'then') return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad)
          if (key === 'single' || key === 'maybeSingle') return one
          if (key === 'update')
            return (patch: Record<string, unknown>) => {
              db.updates.push({ table, patch })
              const rows = db.rows[table] ?? []
              if (rows[0]) db.rows[table] = [{ ...(rows[0] as object), ...patch }, ...rows.slice(1)]
              return proxy
            }
          return () => proxy
        },
      },
    )
    return proxy
  }
  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => undefined,
    },
  }
})

// Whether the Countdown is theirs to open is another test's question (ServicePlannerReorder).
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ settled: true, canOpen: () => false, standing: 'church' }) }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: false, isSuperAdmin: false, isDepartmentHead: () => false }),
}))

// Somebody who runs services: plans the running order and may end it.
vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({ can: (cap: string) => cap === 'svc.sessions' || cap === 'svc.manage' }),
}))

vi.mock('../lib/appSettings', async (original) => {
  const real = await original<typeof import('../lib/appSettings')>()
  return { ...real, useAppSettings: () => real.DEFAULT_SETTINGS }
})

const at = (hhmm: string) => new Date(`${SUNDAY}T${hhmm}:00`)

function session(id: string, name: string, start: string, order: number) {
  return {
    id,
    service_id: 'svc',
    order_index: order,
    start_time: at(start).toISOString(),
    duration_minutes: 30,
    session_name: name,
    department_id: null,
    role_label: null,
    updated_at: '',
    assignees: [],
  }
}

function service(extra: Record<string, unknown> = {}) {
  return { id: 'svc', date: SUNDAY, service_type: 'English', created_at: '', ended_at: null, end_held_at: null, series_id: null, ...extra }
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/services/svc']}>
        <Routes>
          <Route path="/services/:serviceId" element={<ServicePlannerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  db.updates = []
  // Worship 10:00–10:30, Sermon 10:30–11:00.
  db.rows = {
    services: [service()],
    service_sessions: [session('s1', 'Worship', '10:00', 0), session('s2', 'Sermon', '10:30', 1)],
  }
})
afterEach(() => vi.useRealTimers())

describe('a service that has not ended', () => {
  it('offers Not ended beside End service, and pressing it holds the end', async () => {
    vi.setSystemTime(at('10:50'))
    const user = show()
    const notEnded = await screen.findByRole('button', { name: 'Not ended' })
    expect(notEnded).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'End service' })).toBeInTheDocument()

    await user.click(notEnded)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Not ended' })).toHaveAttribute('aria-pressed', 'true'))
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].table).toBe('services')
    expect(typeof db.updates[0].patch.end_held_at).toBe('string')
    expect(screen.getByText(/Marked not ended — Sermon will stay on past its time/)).toBeInTheDocument()
  })

  it('is over at its planned end when nobody said otherwise', async () => {
    vi.setSystemTime(at('11:07'))
    show()
    expect(await screen.findByText('Finished')).toBeInTheDocument()
    expect(screen.queryByText(/Not ended yet/)).toBeNull()
  })

  it('keeps the last session on past its time, counting the overrun, and is not called finished', async () => {
    db.rows.services = [service({ end_held_at: at('10:58').toISOString() })]
    vi.setSystemTime(at('11:07'))
    show()
    expect(await screen.findByText('Not ended yet — Sermon is still running, and its overrun is counting.')).toBeInTheDocument()
    expect(screen.queryByText('Finished')).toBeNull()
    // The rail's clock, counting up against the end it missed.
    expect(screen.getByLabelText(/^Running 7m 00s over$/)).toBeInTheDocument()
    // Ending is still there, however far past the plan it has gone.
    expect(screen.getByRole('button', { name: 'End service' })).toBeInTheDocument()
  })

  it('takes the hold back when pressed again', async () => {
    db.rows.services = [service({ end_held_at: at('10:58').toISOString() })]
    vi.setSystemTime(at('10:59'))
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Not ended' }))
    await waitFor(() => expect(db.updates).toHaveLength(1))
    expect(db.updates[0].patch).toEqual({ end_held_at: null })
  })

  it('is in the last session’s own menu too, and in no other session’s', async () => {
    vi.setSystemTime(at('10:50'))
    const user = show()
    await screen.findByDisplayValue('Sermon')
    await user.click(screen.getByRole('button', { name: 'Actions for Worship' }))
    expect(screen.queryByRole('menuitem', { name: /Not ended/ })).toBeNull()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Actions for Sermon' }))
    await user.click(await screen.findByRole('menuitem', { name: /Not ended/ }))
    await waitFor(() => expect(db.updates).toHaveLength(1))
    expect(typeof db.updates[0].patch.end_held_at).toBe('string')
  })

  it('ending it clears the hold and says how far over the last session ran', async () => {
    db.rows.services = [service({ end_held_at: at('10:58').toISOString() })]
    vi.setSystemTime(at('11:07'))
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'End service' }))
    await user.click(await screen.findByRole('button', { name: 'Yes, end it' }))
    await waitFor(() => expect(db.updates).toHaveLength(1))
    expect(db.updates[0].patch).toEqual({ ended_at: at('11:07').toISOString(), end_held_at: null })
    expect(await screen.findByText(/Sermon ran 7m over\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Not ended' })).toBeNull()
  })
})

/*
 * When availability answers close for the service, said on its page, and
 * changed there for this one service by whoever manages services (0310).
 */
describe('when answers close, on the planner', () => {
  it('says the deadline by the church’s rule, and gives the service one of its own', async () => {
    vi.setSystemTime(at('09:00'))
    const user = show()
    const line = await screen.findByText(/^Availability answers closed/)
    // The night before, at 23:59: long gone by Sunday morning.
    expect(line).toHaveTextContent(/· the night before$/)
    await user.click(screen.getByRole('button', { name: 'Change' }))
    const dialog = screen.getByRole('dialog', { name: 'When answers close for this service' })
    await user.click(within(dialog).getByRole('radio', { name: /A time of its own/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.updates).toHaveLength(1))
    expect(db.updates[0].table).toBe('services')
    // The moment the rule gave, now this service's own: an ISO instant, nothing else in the patch.
    expect(Object.keys(db.updates[0].patch)).toEqual(['availability_closes_override'])
    expect(String(db.updates[0].patch.availability_closes_override)).toMatch(/^2026-09-05T\d{2}:59:00\.000Z$/)
    await waitFor(() => expect(screen.getByText(/^Availability answers closed/)).toHaveTextContent(/· set for this service$/))
  })

  it('is not said on a service that is over', async () => {
    vi.setSystemTime(at('12:30'))
    db.rows.services = [service({ ended_at: at('11:05').toISOString() })]
    show()
    await screen.findAllByText('Worship')
    expect(screen.queryByText(/^Availability answers/)).toBeNull()
  })
})

