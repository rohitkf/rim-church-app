import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PermissionLogCard } from './PermissionLogCard'
import { describeChange, type PermissionChangeRow } from '../lib/permissionLog'

const row = (over: Partial<PermissionChangeRow>): PermissionChangeRow => ({
  id: Math.random().toString(36),
  changed_at: '2026-10-28T13:02:00Z',
  changed_by: 'me',
  kind: 'cell',
  capability: 'rota.assign',
  role_key: 'member',
  department_id: null,
  user_id: null,
  before: null,
  after: 'team',
  leads_only_before: null,
  leads_only_after: null,
  ...over,
})
const person = (id: string) => (id === 'asha' ? 'Asha Mathew' : 'Somebody since removed')
const team = (id: string) => (id === 'w' ? 'Worship' : 'A team since removed')

describe('a change, said as a sentence', () => {
  it('says a church cell from and to, the default by name', () => {
    expect(describeChange(row({}), person, team)).toBe('Team Member · Assign somebody to a role: No (the default) → Their team')
    expect(describeChange(row({ before: 'team', after: null }), person, team)).toBe(
      'Team Member · Assign somebody to a role: Their team → No (the default)',
    )
  })

  it('says a team’s own rule, and “As the church” for none', () => {
    expect(describeChange(row({ kind: 'team', department_id: 'w', before: null, after: 'none' }), person, team)).toBe(
      'Worship · Team Member · Assign somebody to a role: As the church → No',
    )
  })

  it('says a grant given and taken back, to a person or a team’s Heads', () => {
    expect(describeChange(row({ kind: 'grant', role_key: null, capability: 'page.inventory', user_id: 'asha', after: 'all' }), person, team)).toBe(
      'Gave Asha Mathew “Open Inventory”, everywhere',
    )
    expect(
      describeChange(row({ kind: 'grant', role_key: null, capability: 'clockin.approve', department_id: 'w', before: 'all', after: null, leads_only_before: true }), person, team),
    ).toBe('Took back “Approve or refuse a request to be clocked in” from the Heads of Worship')
  })
})

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/queries', () => ({ fetchDepartments: () => Promise.resolve([{ id: 'w', name: 'Worship' }]) }))
vi.mock('../lib/plannerControls', () => ({
  fetchPeopleOptions: () => Promise.resolve([{ id: 'me', first_name: 'Rohit', last_name: 'K' }, { id: 'asha', first_name: 'Asha', last_name: 'Mathew' }]),
}))
const rows = vi.hoisted(() => ({ data: [] as unknown[] }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: rows.data, error: null }) }) }) }),
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PermissionLogCard />
    </QueryClientProvider>,
  )
}

describe('Access › History', () => {
  it('lists the changes newest first, each with who made it', async () => {
    rows.data = [row({ changed_by: 'me' }), row({ kind: 'grant', role_key: null, capability: 'page.inventory', user_id: 'asha', after: 'all', changed_by: null })]
    show()
    const list = await screen.findByRole('list', { name: 'Changes to who can do what' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Rohit K')
    expect(items[1]).toHaveTextContent('Gave Asha Mathew “Open Inventory”')
    expect(items[1]).toHaveTextContent('The app itself')
  })

  it('says when nothing has changed', async () => {
    rows.data = []
    show()
    expect(await screen.findByText('No rule has changed since the log began.')).toBeInTheDocument()
  })
})
