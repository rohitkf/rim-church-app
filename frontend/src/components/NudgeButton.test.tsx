import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NudgeButton } from './NudgeButton'

// Both shapes Supabase can answer with: a count, or a refusal.
type RpcResult = { data: number | null; error: { message: string } | null }
const rpc = vi.fn((): Promise<RpcResult> => Promise.resolve({ data: 3, error: null }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false }) }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])) },
}))

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NudgeButton rpc="nudge_availability" args={{ dept_id: 'd1', svc_id: 's1' }}>
        Remind them
      </NudgeButton>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  rpc.mockClear()
  rpc.mockResolvedValue({ data: 3, error: null })
})

describe('NudgeButton', () => {
  it('reports how many people were actually reminded', async () => {
    const user = renderButton()
    await user.click(screen.getByRole('button', { name: 'Remind them' }))

    expect(rpc).toHaveBeenCalledWith('nudge_availability', { dept_id: 'd1', svc_id: 's1' })
    expect(await screen.findByText('Reminded 3 people')).toBeInTheDocument()
  })

  it('gets the grammar right for one person', async () => {
    rpc.mockResolvedValueOnce({ data: 1, error: null })
    const user = renderButton()
    await user.click(screen.getByRole('button', { name: 'Remind them' }))
    expect(await screen.findByText('Reminded 1 person')).toBeInTheDocument()
  })

  it('does not claim to have sent anything when it sent nothing', async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null })
    const user = renderButton()
    await user.click(screen.getByRole('button', { name: 'Remind them' }))
    expect(await screen.findByText('Nobody to remind')).toBeInTheDocument()
  })

  it('surfaces a refusal from the database instead of going quiet', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Only an Admin or that team's head can send this." },
    })
    const user = renderButton()
    await user.click(screen.getByRole('button', { name: 'Remind them' }))
    expect(await screen.findByText(/didn’t send|didn't send|head can send/i)).toBeInTheDocument()
  })
})
