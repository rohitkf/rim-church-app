import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardReminders, ReminderBanner } from './ReminderBanner'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'me' } } }) }))

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  updates: [] as { table: string; row: unknown; eq: [string, unknown][] }[],
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string) => Promise.resolve({ data: fn === 'my_open_requests' ? state.rows : [], error: null }),
    from: (table: string) => {
      const entry = { table, row: null as unknown, eq: [] as [string, unknown][] }
      const builder: Record<string, unknown> = {
        update: (row: unknown) => {
          entry.row = row
          state.updates.push(entry)
          return builder
        },
        eq: (col: string, v: unknown) => {
          entry.eq.push([col, v])
          return builder
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      }
      return builder
    },
  },
}))

const soon = new Date(Date.now() + 3 * 3_600_000).toISOString()
const later = new Date(Date.now() + 5 * 86_400_000).toISOString()

function show(ui = <DashboardReminders />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.rows = []
  state.updates = []
})

describe('the reminder banner', () => {
  it('shows its words and, only when given one, a link', () => {
    show(<ReminderBanner eyebrow="Heads up" title="Bring the cables" detail="Before 9am" />)
    expect(screen.getByRole('note')).toHaveTextContent('Bring the cables')
    expect(screen.getByText('Before 9am')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('what is waiting on me, on the dashboard', () => {
  it('shows nothing when nothing is waiting', async () => {
    show()
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Waiting on you' })).not.toBeInTheDocument())
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('keeps a poll, an availability ask and a mention in sight, soonest due first, each with its link', async () => {
    state.rows = [
      { kind: 'poll', ref_id: 'p1', title: 'Picnic?', detail: null, on_date: null, due_at: later, created_at: null },
      { kind: 'availability', ref_id: 's1', title: 'English Service', detail: 'Media', on_date: '2026-10-25', due_at: soon, created_at: null },
      { kind: 'mention', ref_id: 'm1', title: 'Grace: can you bring the cables?', detail: null, on_date: null, due_at: null, created_at: null },
    ]
    show()
    const notes = await screen.findAllByRole('note')
    expect(notes.map((n) => n.textContent)).toEqual([
      expect.stringContaining('English Service'),
      expect.stringContaining('Picnic?'),
      expect.stringContaining('can you bring the cables'),
    ])
    expect(screen.getByRole('link', { name: 'Answer' })).toHaveAttribute('href', '/polls?poll=p1')
    expect(screen.getByRole('link', { name: 'Give availability' })).toHaveAttribute('href', '/availability')
  })

  it('marks a mention read when it is opened from here', async () => {
    state.rows = [
      { kind: 'mention', ref_id: 'm1', title: 'Hello', detail: null, on_date: null, due_at: null, created_at: null },
    ]
    const user = show()
    await user.click(await screen.findByRole('link', { name: 'Open' }))
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]).toMatchObject({ table: 'notifications', row: { read_boolean: true } })
    expect(state.updates[0].eq).toEqual([
      ['user_id', 'me'],
      ['type', 'mention'],
      ['reference_id', 'm1'],
    ])
  })
})
