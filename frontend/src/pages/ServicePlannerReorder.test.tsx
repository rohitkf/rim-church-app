import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServicePlannerPage } from './ServicePlannerPage'

/*
 * Once a service has started, the running order is read off a phone rather
 * than arranged, so the drag handles beside each session go — and come
 * back on purpose, from Reorder sessions in the ⋯ menu, until Done.
 */

const SUNDAY = '2026-09-06'
const db = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }))

// Every read: a chain that ends in the table's rows, whatever it was asked.
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

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: false, isSuperAdmin: false, isDepartmentHead: () => false }),
}))

// Somebody who plans the running order, and nothing else.
vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({ can: (cap: string) => cap === 'svc.sessions' }),
}))

vi.mock('../lib/appSettings', async (original) => {
  const real = await original<typeof import('../lib/appSettings')>()
  return { ...real, useAppSettings: () => real.DEFAULT_SETTINGS }
})

function session(id: string, name: string, start: string, order: number) {
  return {
    id,
    service_id: 'svc',
    order_index: order,
    start_time: new Date(`${SUNDAY}T${start}:00`).toISOString(),
    duration_minutes: 30,
    session_name: name,
    department_id: null,
    role_label: null,
    updated_at: '',
    assignees: [],
  }
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
  return userEvent.setup()
}

const handles = () => screen.queryAllByRole('button', { name: /^Reorder .* Hold to drag/ })

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  db.rows = {
    services: [{ id: 'svc', date: SUNDAY, service_type: 'English', created_at: '', ended_at: null, series_id: null }],
    service_sessions: [session('s1', 'Worship', '10:00', 0), session('s2', 'Sermon', '10:30', 1)],
  }
})
afterEach(() => vi.useRealTimers())

describe('reordering the running order', () => {
  it('shows a handle on every session before the service starts', async () => {
    vi.setSystemTime(new Date(`${SUNDAY}T08:00:00`))
    show()
    expect(await screen.findByDisplayValue('Sermon')).toBeInTheDocument()
    expect(handles()).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Done reordering' })).toBeNull()
  })

  it('hides the handles once the service has started, and brings them back from the menu until Done', async () => {
    vi.setSystemTime(new Date(`${SUNDAY}T10:10:00`))
    const user = show()
    expect(await screen.findByDisplayValue('Sermon')).toBeInTheDocument()
    expect(handles()).toHaveLength(0)

    await user.click(screen.getAllByRole('button', { name: 'Actions for this service' })[0])
    await user.click(await screen.findByRole('menuitem', { name: /Reorder sessions/ }))
    expect(handles()).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Done reordering' }))
    expect(handles()).toHaveLength(0)
  })
})
