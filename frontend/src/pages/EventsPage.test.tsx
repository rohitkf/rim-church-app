import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EventsPage } from './EventsPage'

/*
 * The diary, and putting something right in it.
 *
 * An event could be added and removed but not changed, so a time that
 * moved by half an hour meant deleting the thing and typing it again —
 * which loses who added it and, for anybody who had already seen it, looks
 * like the event was cancelled.
 */

const TODAY = '2026-09-13'

const state = vi.hoisted(() => ({
  events: [] as Record<string, unknown>[],
  written: [] as { table: string; op: string; row: unknown; id?: string }[],
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: true,
    isDepartmentHead: () => false,
  }),
}))

vi.mock('../lib/monthGrid', async () => {
  const actual = await vi.importActual<typeof import('../lib/monthGrid')>('../lib/monthGrid')
  return { ...actual, todayIso: () => TODAY }
})

vi.mock('../lib/queries', () => ({
  fetchServices: () => Promise.resolve([]),
  fetchDepartments: () => Promise.resolve([{ id: 'd1', name: 'Media', color: '#3b82f6' }]),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const rows = Promise.resolve({
          data: table === 'church_events' ? state.events : [],
          error: null,
        })
        return Object.assign(rows, { order: () => rows })
      },
      insert: (row: unknown) => {
        state.written.push({ table, op: 'insert', row })
        return Promise.resolve({ error: null })
      },
      update: (row: unknown) => ({
        eq: (_column: string, id: string) => {
          state.written.push({ table, op: 'update', row, id })
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_column: string, id: string) => {
          state.written.push({ table, op: 'delete', row: null, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

const meeting = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: 'Members meeting',
  details: null,
  event_date: '2026-09-18',
  ends_on: null,
  start_time: '19:30:00',
  location: 'Main hall',
  department_id: null,
  created_by: 'u9',
  creator: { first_name: 'Grace', last_name: 'Mensah' },
  department: null,
  ...over,
})

beforeEach(() => {
  state.events = [meeting()]
  state.written = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('editing an event', () => {
  it('opens the same form, holding what the event already says', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('heading', { name: 'Edit this event' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Members meeting')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Main hall')).toBeInTheDocument()
    // "19:30:00" in the database is "19:30" to a time field, or it shows blank.
    expect(screen.getByDisplayValue('19:30')).toBeInTheDocument()
    expect(screen.getByText(/18 Sep/)).toBeInTheDocument()
  })

  it('writes the change to the event that was open, and adds nothing', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    const title = screen.getByDisplayValue('Members meeting')
    await userEvent.clear(title)
    await userEvent.type(title, 'Members meeting (moved)')
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({
      table: 'church_events',
      op: 'update',
      id: 'e1',
    })
    expect(state.written[0].row).toMatchObject({
      title: 'Members meeting (moved)',
      event_date: '2026-09-18',
      start_time: '19:30',
      location: 'Main hall',
    })
  })

  /*
   * The name on a diary row is a fact about who decided the thing, not
   * about who last corrected a typo in it.
   */
  it('leaves the name of whoever added it alone', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).not.toHaveProperty('created_by')
  })

  it('can put an end date on an event that had none', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    await userEvent.click(screen.getByRole('button', { name: 'Add an end date' }))
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).toMatchObject({ ends_on: '2026-09-19' })
  })

  // A run is drawn once per day it covers; every one of those rows is the
  // same event, and editing any of them has to reach the same row.
  it('edits the one event behind a multi-day run, from any of its days', async () => {
    state.events = [meeting({ id: 'e2', title: 'Fasting prayer', ends_on: '2026-09-20' })]
    show()

    const edits = await screen.findAllByRole('button', { name: 'Edit' })
    expect(edits).toHaveLength(3)

    await userEvent.click(edits[2])
    expect(screen.getByDisplayValue('Fasting prayer')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].id).toBe('e2')
  })

  it('still adds a new one when nothing is being edited', async () => {
    show()
    await userEvent.click(await screen.findByRole('button', { name: /Add event/ }))
    await userEvent.type(screen.getByPlaceholderText(/Members' meeting/), 'Workday')

    const form = screen.getByRole('dialog')
    await userEvent.click(within(form).getByRole('button', { name: /Add event/ }))

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({ op: 'insert' })
    expect(state.written[0].row).toMatchObject({ title: 'Workday', created_by: 'u1' })
  })
})
