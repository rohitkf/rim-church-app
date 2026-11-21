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
// Which pages this person may open: the answer the menu and each page's own door give.
const access = vi.hoisted(() => ({ settled: true, opens: [] as string[] }))
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({ settled: access.settled, canOpen: (path: string) => access.opens.includes(path), standing: 'team' }),
}))

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
  access.settled = true
  access.opens = []
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

/*
 * The Countdown is this page's clock, large, and it already links back
 * here. The way there is offered only to whoever may open it: a button
 * that lands on the Dashboard is a button that lied.
 */
describe('the way to the Countdown', () => {
  const link = () => screen.queryByRole('link', { name: 'Countdown' })
  beforeEach(() => vi.setSystemTime(new Date(`${SUNDAY}T08:00:00`)))

  it('is on the running order for somebody who may open the Countdown', async () => {
    access.opens = ['/countdown']
    show()
    expect(await screen.findByDisplayValue('Sermon')).toBeInTheDocument()
    expect(link()).toHaveAttribute('href', '/countdown')
  })

  it('is not there for somebody who may not', async () => {
    access.opens = ['/service-planner']
    show()
    expect(await screen.findByDisplayValue('Sermon')).toBeInTheDocument()
    expect(link()).toBeNull()
  })

  it('waits until who they are is known, and does not appear and then go', async () => {
    access.opens = ['/countdown']
    access.settled = false
    show()
    expect(await screen.findByDisplayValue('Sermon')).toBeInTheDocument()
    expect(link()).toBeNull()
  })
})

/*
 * Whoever translates a session as it is taken (0315): named from the
 * session's menu, under Assign substitute, in a row of their own.
 */
describe('a session’s translator', () => {
  beforeEach(() => vi.setSystemTime(new Date(`${SUNDAY}T08:00:00`)))
  const person = (id: string, first: string, last: string, order: number, mark: object = {}) => ({
    id: `a-${id}`,
    user_id: id,
    guest_id: null,
    order_index: order,
    is_substitute: false,
    profile: { id, first_name: first, last_name: last },
    guest: null,
    ...mark,
  })

  it('is offered in a session’s menu, under Assign substitute, and opens a row that says No translator', async () => {
    const user = show()
    expect(await screen.findByDisplayValue('Sermon')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Translator for Sermon' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Actions for Sermon' }))
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent ?? '')
    const substitute = items.findIndex((text) => text.startsWith('Assign substitute'))
    expect(items[substitute + 1]).toMatch(/^Assign translator/)

    await user.click(screen.getByRole('menuitem', { name: /Assign translator/ }))
    const row = screen.getByRole('group', { name: 'Translator for Sermon' })
    expect(row).toHaveTextContent('Translator')
    expect(screen.getByRole('button', { name: 'Translator for Sermon' })).toHaveTextContent('No translator')
    // Only the session it was asked for.
    expect(screen.queryByRole('group', { name: 'Translator for Worship' })).toBeNull()
  })

  it('shows a session’s translator in their own row, apart from who is taking it', async () => {
    db.rows.service_sessions = [
      {
        ...session('s1', 'Worship', '10:00', 0),
        assignees: [person('u1', 'Grace', 'Mensah', 0), person('u2', 'Rose', 'Sam', 0, { is_translator: true })],
      },
      session('s2', 'Sermon', '10:30', 1),
    ]
    show()
    expect(await screen.findByDisplayValue('Sermon')).toBeInTheDocument()
    const row = screen.getByRole('group', { name: 'Translator for Worship' })
    expect(row).toHaveTextContent('Translator')
    expect(screen.getByRole('button', { name: 'Translator for Worship' })).toBeInTheDocument()
    // The row is there without being asked for, and only on the session that has one.
    expect(screen.queryByRole('group', { name: 'Translator for Sermon' })).toBeNull()
  })
})
