import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DoorPage } from './DoorPage'
import { ReceptionSettingsCard } from '../components/ReceptionSettingsCard'

/*
 * Reception can be locked (0288). While it is, somebody whose way in is
 * a door right is told so and nothing is asked of the database for them;
 * whoever runs registrations carries on, and holds the key.
 */

const state = vi.hoisted(() => ({
  caps: [] as string[],
  lock: { locked: false, note: null as string | null, changed_at: null as string | null, changed_by: null as string | null },
  turned: [] as [boolean, string | null][],
  eventsAsked: 0,
  grants: [] as { capability: string; userId: string | null; departmentId: string | null; reach: string }[],
  saved: [] as unknown[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ settled: true, canOpen: () => false, standing: 'church' }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({ can: (cap: string) => state.caps.includes(cap), grants: state.grants }),
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchRegistrationEvents: () => {
    state.eventsAsked += 1
    return Promise.resolve([])
  },
}))
vi.mock('../lib/queries', () => ({ fetchDepartments: () => Promise.resolve([{ id: 'ushers', name: 'Ushers' }]) }))
vi.mock('../lib/plannerControls', async (original) => ({
  ...(await original<typeof import('../lib/plannerControls')>()),
  fetchPeopleOptions: () => Promise.resolve([{ id: 'grace', first_name: 'Grace', last_name: 'Mensah' }, { id: 'sam', first_name: 'Sam', last_name: 'Otieno' }]),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: { p_changes?: unknown; p_locked?: boolean; p_note?: string | null }) => {
      if (fn === 'reception_lock_state') return Promise.resolve({ data: { ...state.lock }, error: null })
      if (fn === 'set_reception_lock') {
        state.turned.push([args.p_locked!, args.p_note ?? null])
        state.lock = { locked: args.p_locked!, note: args.p_locked ? (args.p_note ?? null) : null, changed_at: new Date().toISOString(), changed_by: 'Grace Mensah' }
        return Promise.resolve({ data: { ...state.lock }, error: null })
      }
      if (fn !== 'set_permission_grants') throw new Error(`unexpected rpc ${fn}`)
      state.saved.push(args.p_changes)
      return Promise.resolve({ data: null, error: null })
    },
  },
}))

function show(ui = <DoorPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.caps = []
  state.lock = { locked: false, note: null, changed_at: null, changed_by: null }
  state.turned = []
  state.eventsAsked = 0
  state.grants = []
  state.saved = []
})

describe('Reception, locked', () => {
  it('tells somebody given the door that it is locked, with the line left for them, and asks the database for nothing', async () => {
    state.caps = ['reg.door', 'reg.door_pay']
    state.lock = { locked: true, note: 'Opens at 9 on Saturday', changed_at: null, changed_by: null }
    show()
    expect(await screen.findByRole('heading', { name: 'Reception is locked' })).toBeInTheDocument()
    expect(screen.getByText('Opens at 9 on Saturday')).toBeInTheDocument()
    expect(screen.getByText(/Your access has not been taken away/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /lock/i })).not.toBeInTheDocument()
    expect(state.eventsAsked).toBe(0)
  })

  it('shows them the door as usual while it is open, and no key', async () => {
    state.caps = ['reg.door']
    show()
    expect(await screen.findByText(/No event today/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Reception lock' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Reception is locked' })).not.toBeInTheDocument()
  })

  it('does not hold whoever runs registrations: the page works, says it is locked, and offers to unlock', async () => {
    state.caps = ['reg.manage']
    state.lock = { locked: true, note: null, changed_at: null, changed_by: null }
    const user = show()
    expect(await screen.findByText('Reception is locked')).toBeInTheDocument()
    expect(await screen.findByText(/No event today/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Unlock Reception' }))
    await waitFor(() => expect(state.turned).toEqual([[false, null]]))
    expect(await screen.findByText('Reception is open')).toBeInTheDocument()
    expect(screen.getByText(/Unlocked by Grace Mensah/)).toBeInTheDocument()
  })

  it('locks only after asking for the line to leave, which may be left empty', async () => {
    state.caps = ['reg.manage']
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Lock Reception' }))
    // Nothing is locked by the first press: it can be backed out of.
    expect(state.turned).toEqual([])
    await user.type(screen.getByLabelText(/A line for whoever is turned away/), '  Back on Sunday ')
    await user.click(screen.getByRole('button', { name: 'Lock Reception' }))
    await waitFor(() => expect(state.turned).toEqual([[true, 'Back on Sunday']]))
    expect(await screen.findByText('Reception is locked')).toBeInTheDocument()
    expect(screen.getByText('Back on Sunday')).toBeInTheDocument()
  })
})

describe('Settings › Reception: who works the door', () => {
  it('shows each team and person given Reception with their ticks, and saves only what was changed', async () => {
    state.caps = ['reg.manage', 'app.permissions']
    state.grants = [
      { capability: 'reg.door', userId: 'grace', departmentId: null, reach: 'all' },
      { capability: 'reg.door_pay', userId: null, departmentId: 'ushers', reach: 'all' },
    ]
    const user = show(<ReceptionSettingsCard />)
    const grace = await screen.findByRole('group', { name: 'What Grace Mensah may do at Reception' })
    expect(grace.querySelectorAll('input:checked')).toHaveLength(1)
    await user.click(screen.getAllByRole('checkbox', { name: /Register walk-ins/ })[1])
    await user.type(screen.getByLabelText('Add a person'), 'sam')
    await user.click(await screen.findByRole('button', { name: 'Add Sam Otieno' }))
    await user.click(screen.getByRole('button', { name: 'Remove Ushers' }))
    await user.click(screen.getByRole('button', { name: /Save who works Reception/ }))
    await waitFor(() => expect(state.saved).toHaveLength(1))
    expect(state.saved[0]).toEqual([
      { capability: 'reg.door_pay', team: 'ushers', reach: null },
      { capability: 'reg.walk_in', person: 'grace', reach: 'all' },
      { capability: 'reg.door', person: 'sam', reach: 'all' },
    ])
  })

  it('is read-only for somebody who runs registrations but may not change the grid', async () => {
    state.caps = ['reg.manage']
    state.grants = [{ capability: 'reg.door', userId: 'grace', departmentId: null, reach: 'all' }]
    show(<ReceptionSettingsCard />)
    const grace = await screen.findByRole('group', { name: 'What Grace Mensah may do at Reception' })
    for (const box of grace.querySelectorAll('input')) expect(box).toBeDisabled()
    expect(screen.queryByLabelText('Add a person')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save who works Reception/ })).not.toBeInTheDocument()
    // The key is still theirs.
    expect(await screen.findByRole('button', { name: 'Lock Reception' })).toBeInTheDocument()
  })
})
