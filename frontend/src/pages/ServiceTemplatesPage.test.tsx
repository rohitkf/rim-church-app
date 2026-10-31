import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { ServiceTemplatesPage } from './ServiceTemplatesPage'
import { chooseOption } from '../test/select'

const db = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  upcoming: 6,
  result: { id: 't1', updated: 5, kept: 1, untouched: 0 },
}))

vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_: unknown, fallback: string) => fallback }))
vi.mock('../lib/queries', () => ({
  fetchServiceTemplates: () =>
    Promise.resolve([{ id: 't1', name: 'Malayalam Service', start_time: '11:30:00', created_at: 'x' }]),
  fetchTemplateSessions: () =>
    Promise.resolve([
      { id: 's1', template_id: 't1', order_index: 1, session_name: 'Worship', duration_minutes: 25 },
      { id: 's2', template_id: 't1', order_index: 2, session_name: 'Conclusion | Live Ens', duration_minutes: 2 },
    ]),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: () => Promise.resolve({ data: table === 'service_series' ? [{ id: 'ser1' }] : [], error: null }),
          in: () => chain,
          gte: () => Promise.resolve({ count: db.upcoming, error: null }),
        }
        return chain
      },
    }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      db.rpc.push({ fn, args })
      return Promise.resolve({ data: db.result, error: null })
    },
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/', element: <ServiceTemplatesPage /> }])
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  db.rpc = []
  db.upcoming = 6
})

describe('editing a template reaches the services it made (0222)', () => {
  it('offers what to do with the upcoming services, keeping hand changes unless told otherwise', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(await screen.findByText(/6 upcoming services were made from this template/)).toBeInTheDocument()
    const fix = screen.getByDisplayValue('Conclusion | Live Ens')
    await user.clear(fix)
    await user.type(fix, 'Conclusion | Live End')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0]).toEqual({
      fn: 'save_service_template',
      args: {
        p_id: 't1',
        p_name: 'Malayalam Service',
        p_start: '11:30',
        p_sessions: [
          { session_name: 'Worship', duration_minutes: 25 },
          { session_name: 'Conclusion | Live End', duration_minutes: 2 },
        ],
        p_upcoming: 'keep',
      },
    })
    expect(await screen.findByRole('status')).toHaveTextContent('5 upcoming services updated. One kept its own changes')
  })

  it('can make every upcoming service match exactly', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await chooseOption(user, await screen.findByLabelText('What saving does to the upcoming services'), 'Update them all to match exactly')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(db.rpc[0]?.args.p_upcoming).toBe('all'))
  })

  it('asks nothing when no repeat has made a service from it', async () => {
    db.upcoming = 0
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await screen.findByDisplayValue('Worship')
    expect(screen.queryByLabelText('What saving does to the upcoming services')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(db.rpc[0]?.args.p_upcoming).toBe('none'))
  })
})
