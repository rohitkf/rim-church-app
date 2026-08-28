import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { JoinTeamPanel } from './JoinTeamPanel'
import type { Department, JoinRequest } from '../lib/types'

const rpc = vi.fn(() => Promise.resolve({ error: null }))

// The panel asks who is looking, to decide how blunt an error should be.
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])) },
}))

function dept(id: string, name: string): Department {
  return {
    id,
    name,
    handbook_url: null,
    color: null,
    is_service_flow: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function pendingFor(department_id: string): JoinRequest {
  return {
    id: 'req-1',
    user_id: 'me',
    department_id,
    status: 'pending',
    note: null,
    created_at: '2026-01-01T00:00:00Z',
    responded_at: null,
    granted_type: null,
    requester: null,
    department: null,
  }
}

function renderPanel(props: {
  departments: Department[]
  memberDeptIds?: string[]
  myRequests?: JoinRequest[]
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <JoinTeamPanel
        departments={props.departments}
        memberDeptIds={props.memberDeptIds ?? []}
        myRequests={props.myRequests ?? []}
      />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('JoinTeamPanel', () => {
  it('offers every team the person is not already on', () => {
    renderPanel({ departments: [dept('d1', 'Media'), dept('d2', 'Worship')], memberDeptIds: ['d2'] })
    expect(screen.getByText('Media')).toBeInTheDocument()
    expect(screen.queryByText('Worship')).not.toBeInTheDocument()
  })

  it('sends the request for the team that was asked for', async () => {
    rpc.mockClear()
    const user = renderPanel({ departments: [dept('d1', 'Media')] })
    await user.click(screen.getByRole('button', { name: /request to join/i }))
    expect(rpc).toHaveBeenCalledWith('request_team_join', { dept_id: 'd1' })
  })

  it('shows an open ask as waiting, with a way to take it back', async () => {
    rpc.mockClear()
    const user = renderPanel({ departments: [dept('d1', 'Media')], myRequests: [pendingFor('d1')] })
    expect(screen.getByText(/waiting on the head/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /withdraw/i }))
    expect(rpc).toHaveBeenCalledWith('withdraw_team_join', { request_id: 'req-1' })
  })

  it('says nothing at all when there is nothing left to join', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <JoinTeamPanel departments={[dept('d1', 'Media')]} memberDeptIds={['d1']} myRequests={[]} />
      </QueryClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('stops saying "Sending…" when the server never answers', async () => {
    // The request itself comes back in about thirty milliseconds. A button
    // that spins for a minute is how one ask becomes three: people press
    // it again, and the log fills with requests nobody meant to send.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      rpc.mockImplementationOnce(() => new Promise(() => {}))
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={client}>
          <JoinTeamPanel departments={[dept('d1', 'Audio')]} memberDeptIds={[]} myRequests={[]} />
        </QueryClientProvider>,
      )

      await user.click(screen.getByRole('button', { name: 'Request to join' }))
      expect(screen.getByRole('button', { name: 'Sending…' })).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000)
      })

      expect(screen.queryByRole('button', { name: 'Sending…' })).toBeNull()
      // The button comes back, so it can be pressed again, and the reason
      // it stopped is on screen rather than left to be guessed at.
      expect(screen.getByRole('button', { name: 'Request to join' })).toBeInTheDocument()
      expect(screen.getByText(/could not send that request/i)).toBeInTheDocument()
    } finally {
      // Restored even on failure, or every test after this one inherits
      // a clock that does not move.
      vi.useRealTimers()
    }
  })

  it('tells the person plainly when the request could not be sent', async () => {
    rpc.mockClear()
    rpc.mockResolvedValueOnce({ error: { message: 'duplicate key value', code: '23505' } } as never)
    const user = renderPanel({ departments: [dept('d1', 'Media')] })
    await user.click(screen.getByRole('button', { name: /request to join/i }))
    expect(await screen.findByText(/already/i)).toBeInTheDocument()
  })
})
