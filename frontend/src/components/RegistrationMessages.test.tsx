import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationMessages } from './RegistrationMessages'
import type { RegistrationMessage } from '../lib/registrations'

/*
 * What people wrote to the organisers, on the event's own page (0287).
 */

const state = vi.hoisted(() => ({ rows: [] as unknown[], marked: [] as { id: string; handled: boolean }[] }))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchRegistrationMessages: () => Promise.resolve(state.rows),
  markRegistrationMessage: (id: string, handled: boolean) => {
    state.marked.push({ id, handled })
    return Promise.resolve()
  },
}))
vi.mock('../lib/supabaseClient', () => ({ supabase: {}, isSupabaseConfigured: true }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))

const message = (over: Partial<RegistrationMessage>): RegistrationMessage => ({
  id: 'm1',
  event_id: 'e1',
  order_id: null,
  name: 'Vera Visitor',
  email: 'vera@example.org',
  message: 'Is there parking?',
  created_at: '2026-11-10T09:00:00Z',
  handled_at: null,
  handled_by: null,
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <RegistrationMessages eventId="e1" eventTitle="Harvest Supper & Dance" codeOf={(id) => (id === 'o1' ? 'AAAAAAAAAAA1' : null)} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.rows = []
  state.marked = []
})

describe('messages to the organisers', () => {
  it('draws nothing at all for an event nobody has written to', async () => {
    show()
    await waitFor(() => expect(screen.queryByText('Messages')).toBeNull())
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('lists who, what and when, the ones still waiting first, each with a way to answer', async () => {
    state.rows = [
      message({ id: 'done', name: 'Dan Done', message: 'All sorted now', created_at: '2026-11-12T09:00:00Z', handled_at: '2026-11-12T10:00:00Z', handled_by: 'u1' }),
      message({ id: 'old', name: 'Vera Visitor', created_at: '2026-11-10T09:00:00Z' }),
      message({ id: 'new', name: 'Ann Awaiting', email: 'ann@example.org', message: 'I paid twice', order_id: 'o1', created_at: '2026-11-11T09:00:00Z' }),
    ]
    show()
    const list = await screen.findByRole('list', { name: 'Messages to the organisers' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((li) => within(li).getAllByRole('paragraph')[0].textContent)).toEqual(['Ann Awaiting', 'Vera Visitor', 'Dan Done'])
    expect(screen.getByText('2 waiting')).toBeInTheDocument()

    // The address answers by email, with the event in the subject.
    expect(within(rows[0]).getByRole('link', { name: 'ann@example.org' })).toHaveAttribute('href', 'mailto:ann@example.org?subject=Re%3A%20Harvest%20Supper%20%26%20Dance')
    expect(rows[0]).toHaveTextContent('I paid twice')
    expect(rows[0]).toHaveTextContent('From ticket AAAAAAAAAAA1')
    expect(rows[1]).not.toHaveTextContent('From ticket')
    expect(within(rows[2]).getByText('Dealt with')).toBeInTheDocument()
  })

  it('puts one away as dealt with, and back', async () => {
    state.rows = [message({ id: 'm1' }), message({ id: 'm2', name: 'Dan Done', handled_at: '2026-11-12T10:00:00Z', handled_by: 'u1' })]
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Mark as dealt with: message from Vera Visitor' }))
    await waitFor(() => expect(state.marked).toEqual([{ id: 'm1', handled: true }]))
    await user.click(screen.getByRole('button', { name: 'Put back as waiting: message from Dan Done' }))
    await waitFor(() => expect(state.marked).toEqual([{ id: 'm1', handled: true }, { id: 'm2', handled: false }]))
  })

  it('says so when every one has been dealt with', async () => {
    state.rows = [message({ handled_at: '2026-11-12T10:00:00Z', handled_by: 'u1' })]
    show()
    expect(await screen.findByText('All dealt with')).toBeInTheDocument()
  })
})
