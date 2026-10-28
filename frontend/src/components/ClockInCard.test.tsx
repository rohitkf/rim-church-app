import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInCard } from './ClockInCard'
import { NavNamesContext } from '../lib/navNames'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: '11111111-1111-1111-1111-111111111111', name: 'Welcome' },
      { id: '22222222-2222-2222-2222-222222222222', name: 'Media' },
    ]),
}))
vi.mock('../lib/plannerControls', async (original) => ({
  ...(await original<typeof import('../lib/plannerControls')>()),
  fetchPeopleOptions: () =>
    Promise.resolve([{ id: '33333333-3333-3333-3333-333333333333', first_name: 'Asha', last_name: 'Mathew' }]),
}))

const db = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  rpc: [] as { fn: string; args: unknown }[],
  grants: [] as unknown[],
}))
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
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: { ...db.row }, error: null }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          db.writes.push(patch)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  db.row = { ...DEFAULT_SETTINGS }
  db.writes = []
  db.rpc = []
  db.grants = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NavNamesContext.Provider value={{}}>
        <ClockInCard />
      </NavNamesContext.Provider>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('Settings › Clock in', () => {
  it('starts five minutes before the call, within 100 m, accurate to 50 m, with nobody else seeing it', async () => {
    show()
    expect(await screen.findByText('5 min')).toBeInTheDocument()
    expect(screen.getByText('100 m')).toBeInTheDocument()
    expect(screen.getByText('50 m')).toBeInTheDocument()
    expect(screen.getByText('Nobody else yet.')).toBeInTheDocument()
    expect(screen.getByText('Only the Owner and Admins approve.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /People who said Yes/ })).not.toBeChecked()
  })

  it('adds a team and a person who may see it, and a team that approves, and saves only those', async () => {
    const user = show()
    await user.click(await screen.findByRole('combobox', { name: 'Who else sees Clock In: add a team' }))
    await user.click(screen.getByRole('option', { name: 'Welcome' }))
    await user.type(screen.getByRole('textbox', { name: 'Who else sees Clock In: add a person' }), 'asha')
    await user.click(await screen.findByRole('button', { name: 'Add Asha Mathew' }))
    const viewers = screen.getByRole('list', { name: 'Who else sees Clock In' })
    expect(within(viewers).getByText('Welcome')).toBeInTheDocument()
    expect(within(viewers).getByText('Asha Mathew')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Teams that approve requests: add a team' }))
    await user.click(screen.getByRole('option', { name: 'Media' }))
    await user.click(screen.getByRole('radio', { name: 'Anyone on it' }))

    await user.click(screen.getByRole('button', { name: 'Save' }))
    // Who may see is the grid's clockin.view (0209): grants, not a list.
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0]).toEqual({
      fn: 'set_permission_grants',
      args: {
        p_changes: [
          { capability: 'clockin.view', team: '11111111-1111-1111-1111-111111111111', reach: 'all' },
          { capability: 'clockin.view', person: '33333333-3333-3333-3333-333333333333', reach: 'all' },
        ],
      },
    })
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toEqual({
      clock_in_approver_teams: ['22222222-2222-2222-2222-222222222222'],
      clock_in_approvers: 'members',
    })
  })

  it('shows who the grid’s grants already let in, and takes one back', async () => {
    db.grants = [
      { id: 'g1', capability: 'clockin.view', userId: null, departmentId: '22222222-2222-2222-2222-222222222222', reach: 'all' },
      { id: 'g2', capability: 'set.edit', userId: '33333333-3333-3333-3333-333333333333', departmentId: null, reach: 'all' },
    ]
    const user = show()
    const viewers = await screen.findByRole('list', { name: 'Who else sees Clock In' })
    expect(within(viewers).getByText('Media')).toBeInTheDocument()
    // Another capability's grant is not this list's.
    expect(within(viewers).queryByText('Asha Mathew')).toBeNull()
    await user.click(within(viewers).getByRole('button', { name: 'Remove Media' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0].args).toEqual({
      p_changes: [{ capability: 'clockin.view', team: '22222222-2222-2222-2222-222222222222', reach: null }],
    })
    expect(db.writes).toHaveLength(0)
  })
})
