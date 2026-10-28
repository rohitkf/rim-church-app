import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrayerSettingsCard } from './PrayerSettingsCard'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/queries', () => ({
  fetchDepartments: () => Promise.resolve([{ id: '11111111-1111-1111-1111-111111111111', name: 'Welcome' }]),
}))
vi.mock('../lib/plannerControls', async (original) => ({
  ...(await original<typeof import('../lib/plannerControls')>()),
  fetchPeopleOptions: () =>
    Promise.resolve([{ id: '33333333-3333-3333-3333-333333333333', first_name: 'Asha', last_name: 'Mathew' }]),
}))

const db = vi.hoisted(() => ({ rpc: [] as { fn: string; args: unknown }[], grants: [] as unknown[] }))
vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({ grants: db.grants, can: () => true }),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      db.rpc.push({ fn, args })
      return Promise.resolve({ error: null })
    },
  },
}))

beforeEach(() => {
  db.rpc = []
  db.grants = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PrayerSettingsCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('Settings › Prayer', () => {
  it('starts with only the Pastors and the Owner', async () => {
    show()
    expect(await screen.findByText('Only the Pastors and the Owner.')).toBeInTheDocument()
    expect(screen.getAllByText('Only the pastors.')).toHaveLength(2)
  })

  it('saves each list as its capability’s grants (0210)', async () => {
    const user = show()
    await user.click(await screen.findByRole('combobox', { name: 'Who else reads private requests: add a team' }))
    await user.click(screen.getByRole('option', { name: 'Welcome' }))
    await user.type(screen.getByRole('textbox', { name: 'Who else runs prayer lists: add a person' }), 'asha')
    await user.click(await screen.findByRole('button', { name: 'Add Asha Mathew' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(2))
    expect(db.rpc.map((c) => c.args)).toEqual([
      { p_changes: [{ capability: 'prayer.pastoral', team: '11111111-1111-1111-1111-111111111111', reach: 'all' }] },
      { p_changes: [{ capability: 'prayer.lists', person: '33333333-3333-3333-3333-333333333333', reach: 'all' }] },
    ])
  })

  it('shows the grants already given, each under its own list', async () => {
    db.grants = [{ id: 'g1', capability: 'prayer.assign', userId: null, departmentId: '11111111-1111-1111-1111-111111111111', reach: 'all' }]
    show()
    const assigners = await screen.findByRole('list', { name: 'Who else asks people to pray' })
    expect(within(assigners).getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('Only the Pastors and the Owner.')).toBeInTheDocument()
  })
})
