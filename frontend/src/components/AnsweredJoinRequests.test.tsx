import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnsweredJoinRequests } from './AnsweredJoinRequests'

const calls = vi.hoisted(() => [] as { op: string; column: string; value: unknown }[])

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        neq: (column: string, value: unknown) => {
          calls.push({ op: 'delete-neq', column, value })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

function show(count: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AnsweredJoinRequests count={count} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('answered join requests', () => {
  it('says nothing when there are none', () => {
    show(0)
    expect(screen.queryByText(/kept as a record/)).toBeNull()
  })

  it('clears the answered ones after asking — never the ones still waiting', async () => {
    const user = show(3)
    expect(screen.getByText('3 answered join requests are kept as a record.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear them' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/Nobody is taken off a team/)
    expect(calls).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(calls).toEqual([{ op: 'delete-neq', column: 'status', value: 'pending' }]))
  })
})
