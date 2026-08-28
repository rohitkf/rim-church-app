import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { NotificationsBell } from './NotificationsBell'

const ROWS = [
  {
    id: 'n1',
    user_id: 'u1',
    type: 'message',
    reference_id: null,
    read_boolean: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'n2',
    user_id: 'u1',
    type: 'team_join_approved',
    reference_id: 'dept-7',
    read_boolean: true,
    created_at: new Date().toISOString(),
  },
]

const updated = vi.fn()

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } } }) }))

vi.mock('../lib/supabaseClient', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: ROWS, error: null }),
  }
  return {
    supabase: {
      from: () => ({
        ...chain,
        update: (patch: unknown) => ({
          eq: (col: string, value: string) => {
            updated(patch, col, value)
            return { eq: () => Promise.resolve({ error: null }), then: undefined, error: null }
          },
        }),
      }),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  }
})

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}

function renderBell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <NotificationsBell />
        <Where />
        <Routes>
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('the notifications bell', () => {
  it('opens each notification on the page it came from', async () => {
    const user = renderBell()
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    await user.click(await screen.findByRole('link', { name: /New message board post/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/messages')
  })

  it('deep-links to the team when the notification names one', async () => {
    const user = renderBell()
    await user.click(screen.getByRole('button', { name: 'Notifications' }))

    await user.click(await screen.findByRole('link', { name: /You have been added to a team/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/departments/dept-7')
  })

  it('marks the one you opened as read, and closes the panel behind you', async () => {
    updated.mockClear()
    const user = renderBell()
    await user.click(screen.getByRole('button', { name: 'Notifications' }))
    await user.click(await screen.findByRole('link', { name: /New message board post/ }))

    expect(updated).toHaveBeenCalledWith({ read_boolean: true }, 'id', 'n1')
    expect(screen.queryByRole('link', { name: /New message board post/ })).not.toBeInTheDocument()
  })
})
