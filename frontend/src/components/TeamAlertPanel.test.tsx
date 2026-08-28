import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TeamAlertPanel } from './TeamAlertPanel'

const rpc = vi.fn(() => Promise.resolve({ data: 4, error: null }))
let auth = { isAdmin: false, ledDepartmentIds: ['d1'] }

vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Audio', color: '#ff375f', handbook_url: null, is_service_flow: false },
      { id: 'd2', name: 'Media', color: '#0a84ff', handbook_url: null, is_service_flow: false },
    ]),
  fetchServices: () =>
    Promise.resolve([
      { id: 's1', date: '2099-01-04', service_type: 'English Service' },
      { id: 's2', date: '2099-01-11', service_type: 'Malayalam Service' },
    ]),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])) },
}))

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TeamAlertPanel />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  rpc.mockClear()
  auth = { isAdmin: false, ledDepartmentIds: ['d1'] }
})

describe('TeamAlertPanel', () => {
  it('is not there at all for someone who heads nothing', async () => {
    auth = { isAdmin: false, ledDepartmentIds: [] }
    renderPanel()
    // Give the department query a tick to resolve before asserting absence.
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText('Send an alert')).not.toBeInTheDocument()
  })

  it('offers a head only the team they head', async () => {
    renderPanel()
    await screen.findByText('Send an alert')
    // One team means no picker to get wrong.
    expect(screen.queryByRole('combobox', { name: /team/i })).not.toBeInTheDocument()
  })

  it('sends to the whole team by default', async () => {
    const user = renderPanel()
    await screen.findByText('Send an alert')

    await user.type(screen.getByRole('textbox'), 'Sound check at 8:30')
    await user.click(screen.getByRole('button', { name: 'Send alert' }))

    expect(rpc).toHaveBeenCalledWith('alert_team', {
      dept_id: 'd1',
      message: 'Sound check at 8:30',
      svc_id: null,
    })
    expect(await screen.findByText('Sent to 4 people.')).toBeInTheDocument()
  })

  it('narrows to one service when asked, and names it', async () => {
    const user = renderPanel()
    await screen.findByText('Send an alert')

    await user.click(screen.getByRole('button', { name: 'One service' }))
    await user.type(screen.getByRole('textbox'), 'Bring the spare XLR')
    await user.click(screen.getByRole('button', { name: 'Send alert' }))

    expect(rpc).toHaveBeenCalledWith('alert_team', {
      dept_id: 'd1',
      message: 'Bring the spare XLR',
      svc_id: 's1',
    })
  })

  it('will not send an empty alert', async () => {
    renderPanel()
    await screen.findByText('Send an alert')
    expect(screen.getByRole('button', { name: 'Send alert' })).toBeDisabled()
  })

  it('says so when the alert reached nobody, rather than claiming success', async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null })
    const user = renderPanel()
    await screen.findByText('Send an alert')

    await user.type(screen.getByRole('textbox'), 'anyone there?')
    await user.click(screen.getByRole('button', { name: 'Send alert' }))

    expect(await screen.findByText(/Nobody to send that to/)).toBeInTheDocument()
  })
})
