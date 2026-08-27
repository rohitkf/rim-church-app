import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JoinRequestsPanel } from './JoinRequestsPanel'
import type { JoinRequest } from '../lib/types'

const rpc = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])) },
}))

const request: JoinRequest = {
  id: 'req-1',
  user_id: 'u1',
  department_id: 'd1',
  status: 'pending',
  note: 'I can run slides',
  created_at: new Date().toISOString(),
  responded_at: null,
  granted_type: null,
  requester: { id: 'u1', first_name: 'Ada', last_name: 'Grace', avatar_url: null },
  department: { id: 'd1', name: 'Media', color: null },
}

function renderPanel(requests: JoinRequest[] = [request]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <JoinRequestsPanel requests={requests} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('JoinRequestsPanel', () => {
  it('names who asked, for which team, and what they said', () => {
    renderPanel()
    expect(screen.getByText('Ada Grace')).toBeInTheDocument()
    expect(screen.getByText(/Media · asked/)).toBeInTheDocument()
    expect(screen.getByText(/I can run slides/)).toBeInTheDocument()
  })

  it('makes core and guest two separate decisions', async () => {
    rpc.mockClear()
    const user = renderPanel()
    await user.click(screen.getByRole('button', { name: /core member/i }))
    expect(rpc).toHaveBeenCalledWith('respond_team_join', {
      request_id: 'req-1',
      accept: true,
      as_type: 'core',
    })

    rpc.mockClear()
    await user.click(screen.getByRole('button', { name: /add as guest/i }))
    expect(rpc).toHaveBeenCalledWith('respond_team_join', {
      request_id: 'req-1',
      accept: true,
      as_type: 'guest',
    })
  })

  it('declines without adding anyone', async () => {
    rpc.mockClear()
    const user = renderPanel()
    await user.click(screen.getByRole('button', { name: /decline/i }))
    expect(rpc).toHaveBeenCalledWith('respond_team_join', {
      request_id: 'req-1',
      accept: false,
      as_type: 'core',
    })
  })

  it('stays out of the way when the inbox is empty', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <JoinRequestsPanel requests={[]} />
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('reports a refusal from the database', async () => {
    rpc.mockClear()
    rpc.mockResolvedValueOnce({
      error: { message: 'That request is no longer open', code: 'P0001' },
    } as never)
    const user = renderPanel()
    await user.click(screen.getByRole('button', { name: /core member/i }))
    expect(await screen.findByText(/no longer open/i)).toBeInTheDocument()
  })
})
