import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
      clock_in_viewers: { teams: ['22222222-2222-2222-2222-222222222222'], people: [] },
    }),
  }
})
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ overrides: {}, teams: {} }) }))
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
    const { user } = show()
    await chooseAsha(user)
    const pages = await screen.findByRole('list', { name: 'Pages Asha Mathew can open' })
    expect(within(pages).getByRole('listitem', { name: 'Team Rota: can open' })).toBeInTheDocument()
    // Clock In opens to her through Media, which the church named for it.
    const clockIn = within(pages).getByRole('listitem', { name: 'Clock In: can open' })
    expect(within(clockIn).getByText('Named in Clock in')).toBeInTheDocument()
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
    expect(within(lists).getByText('Sees the Clock In page and every clock-in')).toBeInTheDocument()
    expect(within(lists).getByText('Through Media')).toBeInTheDocument()
  })

  it('sends a change of reach to By role', async () => {
    const { user, onOpenRoles } = show()
    await chooseAsha(user)
    await user.click(await screen.findByRole('button', { name: 'By role' }))
    expect(onOpenRoles).toHaveBeenCalled()
  })
})
