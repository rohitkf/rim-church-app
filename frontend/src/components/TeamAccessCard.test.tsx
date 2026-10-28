import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TeamAccessCard } from './TeamAccessCard'
import type { PersonFacts } from '../lib/personAccess'

const WORSHIP = '22222222-2222-2222-2222-222222222222'
const MEDIA = '11111111-1111-1111-1111-111111111111'

vi.mock('../lib/appSettings', async (original) => {
  const real = await original<typeof import('../lib/appSettings')>()
  return { ...real, useAppSettings: () => real.DEFAULT_SETTINGS }
})
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))
const perms = vi.hoisted(() => ({
  grants: [] as unknown[],
  teams: {} as Record<string, Record<string, Record<string, string>>>,
  rpc: [] as { fn: string; args: unknown }[],
}))
vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({ overrides: {}, teams: perms.teams, grants: perms.grants, can: () => true }),
}))
vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: MEDIA, name: 'Media' },
      { id: WORSHIP, name: 'Worship' },
    ]),
}))
const facts = (over: Partial<PersonFacts>): PersonFacts => ({
  id: 'x',
  owner: false,
  admin: false,
  overwatch: false,
  pastor: false,
  headTeams: [],
  assistTeams: [],
  memberTeams: [],
  coordinatorTeams: [],
  ...over,
})
vi.mock('../lib/peopleFacts', () => ({
  fetchEveryonesFacts: () =>
    Promise.resolve([
      { id: 'asha', name: 'Asha Mathew', facts: facts({ id: 'asha', headTeams: [WORSHIP], memberTeams: [WORSHIP] }) },
      { id: 'ben', name: 'Ben Joseph', facts: facts({ id: 'ben', memberTeams: [WORSHIP, MEDIA] }) },
      { id: 'grace', name: 'Grace Mensah', facts: facts({ id: 'grace', memberTeams: [MEDIA] }) },
    ]),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      perms.rpc.push({ fn, args })
      return Promise.resolve({ error: null })
    },
  },
}))

beforeEach(() => {
  perms.grants = []
  perms.teams = {}
  perms.rpc = []
})

function show(at = '/settings/access?tab=team') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <TeamAccessCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function chooseWorship(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('combobox', { name: 'Team' }))
  await user.click(screen.getByRole('option', { name: 'Worship' }))
}

describe('Settings › Access › By team', () => {
  it('says nothing until a team is chosen, and opens on the one a link names', async () => {
    show()
    expect(await screen.findByRole('combobox', { name: 'Team' })).toBeInTheDocument()
    expect(screen.queryByText('Given to the team')).toBeNull()
  })

  it('says who is on it, each a way into By person', async () => {
    const user = show()
    await chooseWorship(user)
    const who = await screen.findByLabelText('Who is on Worship')
    expect(within(who).getByText('Team Head · 1')).toBeInTheDocument()
    expect(within(who).getAllByRole('link', { name: 'Asha Mathew' })[0]).toHaveAttribute('href', '/settings/access?tab=person&person=asha')
    expect(within(who).getByText('Team Member · 2')).toBeInTheDocument()
    expect(within(who).queryByText('Grace Mensah')).toBeNull()
  })

  it('shows each page’s rules in force, and marks the team’s own', async () => {
    perms.teams = { [WORSHIP]: { 'rota.assign': { member: 'team' } } }
    const user = show(`/settings/access?tab=team&team=${WORSHIP}`)
    expect(await screen.findByTestId('team-own-rules')).toHaveTextContent('one rule of its own')
    const rota = screen.getByRole('button', { name: /^Team Rota/ })
    expect(rota).toHaveTextContent('Own rules')
    expect(rota).toHaveTextContent('Member 1 of 4')
    await user.click(rota)
    const row = screen.getByRole('rowheader', { name: 'Assign roles' }).closest('tr')!
    expect(within(row).getByLabelText('This team’s own rule')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change Worship’s rules for Team Rota' })).toHaveAttribute('href', '/settings/pages#rota')
  })

  it('lists what the team has been given, and takes one back', async () => {
    perms.grants = [
      { id: 'g1', capability: 'clockin.approve', userId: null, departmentId: WORSHIP, reach: 'all', leadsOnly: true },
      { id: 'g2', capability: 'set.edit', userId: null, departmentId: MEDIA, reach: 'team' },
    ]
    const user = show(`/settings/access?tab=team&team=${WORSHIP}`)
    const given = await screen.findByRole('list', { name: 'Given to Worship' })
    const items = within(given).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Approve or refuse a request to be clocked in')
    expect(items[0]).toHaveTextContent('Its Heads only')
    await user.click(within(items[0]).getByRole('button', { name: /Take back/ }))
    await waitFor(() => expect(perms.rpc).toHaveLength(1))
    expect(perms.rpc[0]).toEqual({
      fn: 'set_permission_grants',
      args: { p_changes: [{ capability: 'clockin.approve', team: WORSHIP, reach: null }] },
    })
  })

  it('gives the team one thing more, for its Heads alone if asked', async () => {
    const user = show(`/settings/access?tab=team&team=${WORSHIP}`)
    await user.click(await screen.findByRole('combobox', { name: 'Give the team' }))
    await user.click(screen.getByRole('option', { name: 'Assign somebody to a role' }))
    await user.click(screen.getByRole('switch', { name: 'For its Heads only' }))
    await user.click(screen.getByRole('button', { name: 'Give' }))
    await waitFor(() => expect(perms.rpc).toHaveLength(1))
    expect(perms.rpc[0].args).toEqual({
      p_changes: [{ capability: 'rota.assign', team: WORSHIP, reach: 'team', leads_only: true }],
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
  })
})
