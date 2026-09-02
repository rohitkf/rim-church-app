import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InvitationHistory } from './InvitationHistory'
import type { Invitation } from '../lib/types'

const invoke = vi.fn()
const del = vi.fn()
const fetchInvitations = vi.fn()

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))
vi.mock('../lib/queries', () => ({ fetchInvitations: () => fetchInvitations() }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...(args as [])) },
    from: () => ({ delete: () => ({ eq: (...args: unknown[]) => del(...(args as [])) }) }),
  },
}))

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: 'inv-1',
    email: 'grace@rehoboth.org',
    department_id: null,
    invited_by: 'u1',
    created_at: daysAgo(1),
    accepted_at: null,
    inviter: { id: 'u1', first_name: 'Ada', last_name: 'Grace' },
    department: null,
    ...overrides,
  }
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <InvitationHistory />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('InvitationHistory', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { ok: true }, error: null })
    del.mockReset()
    del.mockResolvedValue({ error: null })
    fetchInvitations.mockReset()
    fetchInvitations.mockResolvedValue([invitation()])
  })

  it('names who was asked and who asked them', async () => {
    show()
    expect(await screen.findByText('grace@rehoboth.org')).toBeInTheDocument()
    expect(screen.getByText(/Invited by Ada Grace/)).toBeInTheDocument()
  })

  it('says plainly that nobody has been invited yet', async () => {
    fetchInvitations.mockResolvedValue([])
    show()
    expect(await screen.findByText('Nobody has been invited yet.')).toBeInTheDocument()
  })

  it('separates an invitation still waiting from one that has had no reply', async () => {
    fetchInvitations.mockResolvedValue([
      invitation({ id: 'a', email: 'new@rehoboth.org', created_at: daysAgo(1) }),
      invitation({ id: 'b', email: 'old@rehoboth.org', created_at: daysAgo(40) }),
    ])
    show()
    expect(await screen.findByText('Waiting')).toBeInTheDocument()
    expect(screen.getByText('No reply')).toBeInTheDocument()
  })

  it('shows when somebody arrived, and stops offering to chase them', async () => {
    fetchInvitations.mockResolvedValue([invitation({ accepted_at: daysAgo(1) })])
    show()
    expect(await screen.findByText('Accepted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Send again/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
  })

  it('filters down to the ones nobody has answered', async () => {
    fetchInvitations.mockResolvedValue([
      invitation({ id: 'a', email: 'waiting@rehoboth.org' }),
      invitation({ id: 'b', email: 'joined@rehoboth.org', accepted_at: daysAgo(1) }),
    ])
    const user = show()
    await screen.findByText('waiting@rehoboth.org')
    await user.click(screen.getByRole('button', { name: /Outstanding/ }))
    expect(screen.getByText('waiting@rehoboth.org')).toBeInTheDocument()
    expect(screen.queryByText('joined@rehoboth.org')).not.toBeInTheDocument()
  })

  it('sends the same invitation again through the function that can send it', async () => {
    fetchInvitations.mockResolvedValue([invitation({ department_id: 'd1' })])
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Send again/ }))
    expect(invoke).toHaveBeenCalledWith('invite', {
      body: { email: 'grace@rehoboth.org', department_id: 'd1' },
    })
  })

  it('reports the refusal the function gives rather than a shrug', async () => {
    invoke.mockResolvedValue({ data: { error: 'Too many invitations have gone out.' }, error: null })
    const user = show()
    await user.click(await screen.findByRole('button', { name: /Send again/ }))
    expect(await screen.findByText('Too many invitations have gone out.')).toBeInTheDocument()
  })

  it('asks before removing a record, and says it cannot un-send the email', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: /^Remove$/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/cannot un-send an email/)).toBeInTheDocument()
    expect(del).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Remove it/ }))
    await waitFor(() => expect(del).toHaveBeenCalledWith('id', 'inv-1'))
  })
})
