import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PersonAccessCard } from './PersonAccessCard'
import { NavNamesContext } from '../lib/navNames'

vi.mock('../lib/appSettings', async (original) => {
  const real = await original<typeof import('../lib/appSettings')>()
  return {
    ...real,
    useAppSettings: () => ({
      ...real.DEFAULT_SETTINGS,
      clock_in_approver_teams: ['22222222-2222-2222-2222-222222222222'],
    }),
  }
})
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))
const perms = vi.hoisted(() => ({ grants: [] as unknown[], rpc: [] as { fn: string; args: unknown }[] }))
vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({ overrides: {}, teams: {}, grants: perms.grants, can: () => true }),
}))
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
vi.mock('../lib/stage', async (original) => ({
  ...(await original<typeof import('../lib/stage')>()),
  fetchStageTeamAccess: () => Promise.resolve([]),
}))

/* Asha heads Media and is a guest on Welcome; the rota has her coordinating nowhere. */
const TABLES: Record<string, unknown[]> = {
  user_roles: [{ role_type: 'department_head', department_id: '22222222-2222-2222-2222-222222222222' }],
  department_members: [
    { department_id: '22222222-2222-2222-2222-222222222222', member_type: 'core' },
    { department_id: '11111111-1111-1111-1111-111111111111', member_type: 'guest' },
  ],
  rota_assignments: [{ department_id: '11111111-1111-1111-1111-111111111111', role_label: 'Camera' }],
}
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      perms.rpc.push({ fn, args })
      return Promise.resolve({ error: null })
    },
    from: (table: string) => {
      const result = { data: TABLES[table] ?? [], error: null }
      const chain = {
        eq: () => chain,
        ilike: () => chain,
        then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      }
      return {
        select: () =>
          table === 'app_owner'
            ? { maybeSingle: () => Promise.resolve({ data: { user_id: 'somebody-else' }, error: null }) }
            : chain,
      }
    },
  },
}))

beforeEach(() => {
  perms.grants = []
  perms.rpc = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onOpenRoles = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NavNamesContext.Provider value={{}}>
          <PersonAccessCard onOpenRoles={onOpenRoles} />
        </NavNamesContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { user: userEvent.setup(), onOpenRoles }
}

async function chooseAsha(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Person' }))
  await user.click(screen.getByRole('option', { name: 'Asha Mathew' }))
}

describe('Settings › Access › By person', () => {
  it('says nothing until somebody is chosen', async () => {
    show()
    expect(await screen.findByRole('combobox', { name: 'Person' })).toBeInTheDocument()
    expect(screen.queryByText('Pages they can open')).not.toBeInTheDocument()
  })

  it('says what they are, team by team', async () => {
    const { user } = show()
    await chooseAsha(user)
    const what = await screen.findByRole('list', { name: 'What Asha Mathew is' })
    expect(within(what).getByText('Team Head · Media')).toBeInTheDocument()
    expect(within(what).getByText('Team Member · Media')).toBeInTheDocument()
    expect(within(what).getByText('Team Member · Welcome (guest)')).toBeInTheDocument()
    expect(within(what).queryByText(/Coordinator/)).not.toBeInTheDocument()
  })

  it('lists the pages they can open, and why', async () => {
    // Media is given clockin.view (0209), and Asha heads it.
    perms.grants = [{ id: 'g0', capability: 'clockin.view', userId: null, departmentId: '22222222-2222-2222-2222-222222222222', reach: 'all' }]
    const { user } = show()
    await chooseAsha(user)
    const pages = await screen.findByRole('list', { name: 'Pages Asha Mathew can open' })
    expect(within(pages).getByRole('listitem', { name: 'Team Rota: can open' })).toBeInTheDocument()
    // Clock In opens to her through Media's grant.
    const clockIn = within(pages).getByRole('listitem', { name: 'Clock In: can open' })
    expect(within(clockIn).getByText('Given “See clock-ins”')).toBeInTheDocument()
    const given = screen.getByRole('list', { name: 'Given to them' })
    expect(within(given).getByText('See the Clock In page and every clock-in')).toBeInTheDocument()
    expect(within(given).getByText('Through Media')).toBeInTheDocument()
  })

  it('answers each action with where it reaches and which profile gives it', async () => {
    const { user } = show()
    await chooseAsha(user)
    const row = (await screen.findByText('Assign somebody to a role')).closest('li')!
    expect(within(row).getByText('Media')).toBeInTheDocument()
    expect(within(row).getByText('As Team Head')).toBeInTheDocument()
    // The grid's own key, held by Admins alone, is hidden until asked for.
    expect(screen.queryByText('Change who can do what — this grid')).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Show what they can’t' }))
    const keys = screen.getByText('Change who can do what — this grid').closest('li')!
    expect(within(keys).getByText('No')).toBeInTheDocument()
  })

  it('names the lists outside the grid that carry them', async () => {
    const { user } = show()
    await chooseAsha(user)
    const lists = await screen.findByRole('list', { name: 'Lists that name them' })
    expect(within(lists).getByText('Approves requests to be clocked in')).toBeInTheDocument()
    expect(within(lists).getByText('Through Media')).toBeInTheDocument()
  })

  it('sends a change of reach to By role', async () => {
    const { user, onOpenRoles } = show()
    await chooseAsha(user)
    await user.click(await screen.findByRole('button', { name: 'By role' }))
    expect(onOpenRoles).toHaveBeenCalled()
  })

  it('says what the church gave them by name, and counts it in their answers', async () => {
    perms.grants = [
      { id: 'g1', capability: 'set.edit', userId: '33333333-3333-3333-3333-333333333333', departmentId: null, reach: 'all' },
      { id: 'g2', capability: 'svc.guests', userId: null, departmentId: '11111111-1111-1111-1111-111111111111', reach: 'team' },
    ]
    const { user } = show()
    await chooseAsha(user)
    const given = await screen.findByRole('list', { name: 'Given to them' })
    const items = within(given).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('By name')
    expect(items[0]).toHaveTextContent('Everywhere')
    expect(items[1]).toHaveTextContent('Through Welcome')
    expect(items[1]).toHaveTextContent('On Welcome')
    // A team's grant is the team's to take back, not one person's.
    expect(within(items[1]).queryByRole('button', { name: /Take back/ })).toBeNull()
    await user.click(within(items[0]).getByRole('button', { name: /Take back/ }))
    await waitFor(() => expect(perms.rpc).toHaveLength(1))
    expect(perms.rpc[0]).toEqual({
      fn: 'set_permission_grants',
      args: { p_changes: [{ capability: 'set.edit', person: '33333333-3333-3333-3333-333333333333', reach: null }] },
    })
  })

  it('gives them one thing more, only as far as the grid could reach', async () => {
    const { user } = show()
    await chooseAsha(user)
    await user.click(await screen.findByRole('combobox', { name: 'Give them' }))
    // The keys to the app are never on offer.
    expect(screen.queryByRole('option', { name: 'Change who can do what — this grid' })).toBeNull()
    await user.click(screen.getByRole('option', { name: 'Assign somebody to a role' }))
    await user.click(screen.getByRole('combobox', { name: 'How far' }))
    await user.click(screen.getByRole('option', { name: 'Everywhere' }))
    await user.click(screen.getByRole('button', { name: 'Give' }))
    await waitFor(() => expect(perms.rpc).toHaveLength(1))
    expect(perms.rpc[0].args).toEqual({
      p_changes: [{ capability: 'rota.assign', person: '33333333-3333-3333-3333-333333333333', reach: 'all' }],
    })
  })
})

