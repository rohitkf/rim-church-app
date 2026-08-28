import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ActivityFeed } from './ActivityFeed'

const ROWS = [
  {
    id: 'a1',
    kind: 'availability',
    subject: 'Audio',
    detail: 'available',
    created_at: new Date().toISOString(),
    actor: { id: 'u2', first_name: 'Grace', last_name: 'Mensah' },
  },
  {
    id: 'a2',
    kind: 'rota',
    subject: 'Monitors',
    detail: 'Tunde Alabi assigned',
    created_at: new Date().toISOString(),
    actor: { id: 'u1', first_name: 'Rohit', last_name: 'Kumar' },
  },
  {
    id: 'a3',
    kind: 'checklist',
    subject: 'Line check',
    detail: 'signed_off',
    created_at: new Date().toISOString(),
    // An actor whose account has since gone.
    actor: null,
  },
]

let rows: typeof ROWS = ROWS
let isAdmin = false
const rpc = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin }) }))

vi.mock('../lib/supabaseClient', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return {
    supabase: {
      from: () => chain,
      rpc: (...args: unknown[]) => rpc(...(args as [])),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  }
})

function renderFeed() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ActivityFeed serviceId="s1" />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  rows = ROWS
  isAdmin = false
  rpc.mockClear()
})

describe('ActivityFeed', () => {
  it('reads as sentences about people, not as table rows', async () => {
    renderFeed()
    expect(await screen.findByText('Grace Mensah')).toBeInTheDocument()
    expect(screen.getByText('can serve — Audio')).toBeInTheDocument()
    expect(screen.getByText('put Tunde Alabi on Monitors')).toBeInTheDocument()
  })

  it('still says what happened when the person behind it is gone', async () => {
    renderFeed()
    expect(await screen.findByText('Someone')).toBeInTheDocument()
    expect(screen.getByText('signed off Line check')).toBeInTheDocument()
  })

  it('says the service is quiet rather than showing an empty box', async () => {
    rows = []
    renderFeed()
    expect(await screen.findByText(/Nothing has happened on this service yet/)).toBeInTheDocument()
  })

  it('offers Clear to an Admin only', async () => {
    renderFeed()
    await screen.findByText('Grace Mensah')
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it('clears this service alone, not the whole table', async () => {
    isAdmin = true
    const user = renderFeed()
    await screen.findByText('Grace Mensah')

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(rpc).toHaveBeenCalledWith('clear_activity', { svc: 's1' })
  })
})
