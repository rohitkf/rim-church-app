import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { PermissionLogCard } from './PermissionLogCard'
import { changeMatches, describeChange, putBack, type PermissionChangeRow } from '../lib/permissionLog'

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
  until_before: null,
  until_after: null,
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

  it('says a grant’s end date, a change of it, and one that ran out (0218)', () => {
    const until = new Date(2026, 10, 13).toISOString()
    const day = new Date(2026, 10, 12, 12).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    const grant = { kind: 'grant' as const, role_key: null, capability: 'rota.assign', user_id: 'asha' }
    expect(describeChange(row({ ...grant, after: 'team', until_after: until }), person, team)).toBe(
      `Gave Asha Mathew “Assign somebody to a role”, on their teams until ${day}`,
    )
    expect(describeChange(row({ ...grant, before: 'team', after: 'team', until_after: until }), person, team)).toBe(
      `Changed Asha Mathew’s “Assign somebody to a role” to end on ${day}`,
    )
    expect(describeChange(row({ ...grant, before: 'team', after: 'team', until_before: until }), person, team)).toBe(
      'Changed Asha Mathew’s “Assign somebody to a role” to have no end date',
    )
    expect(describeChange(row({ ...grant, before: 'team', after: null, until_before: until, changed_by: null }), person, team)).toBe(
      '“Assign somebody to a role” for Asha Mathew ran out',
    )
    expect(describeChange(row({ ...grant, before: 'team', after: null, until_before: until }), person, team)).toBe(
      'Took back “Assign somebody to a role” from Asha Mathew',
    )
  })
})

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/queries', () => ({ fetchDepartments: () => Promise.resolve([{ id: 'w', name: 'Worship' }]) }))
vi.mock('../lib/plannerControls', () => ({
  fetchPeopleOptions: () => Promise.resolve([{ id: 'me', first_name: 'Rohit', last_name: 'K' }, { id: 'asha', first_name: 'Asha', last_name: 'Mathew' }]),
}))
const rows = vi.hoisted(() => ({ data: [] as unknown[], rpc: [] as { fn: string; args: unknown }[], editable: true }))
vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({ overrides: {}, teams: {}, grants: [], can: () => rows.editable }),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: rows.data, error: null }) }) }) }),
    rpc: (fn: string, args: unknown) => {
      rows.rpc.push({ fn, args })
      return Promise.resolve({ error: null })
    },
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PermissionLogCard />
      </MemoryRouter>
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
    expect(within(items[1]).getByRole('link', { name: 'What they can do now' })).toHaveAttribute(
      'href',
      '/settings/access?tab=person&person=asha',
    )
    expect(within(items[0]).queryByRole('link')).toBeNull()
  })

  it('says when nothing has changed', async () => {
    rows.data = []
    show()
    expect(await screen.findByText('No rule has changed since the log began.')).toBeInTheDocument()
  })

  it('is searched by name, team or action, and narrowed to one kind', async () => {
    rows.data = [
      row({ changed_by: 'me' }),
      row({ kind: 'team', department_id: 'w', before: null, after: 'none', changed_by: 'asha' }),
      row({ kind: 'grant', role_key: null, capability: 'page.inventory', user_id: 'asha', after: 'all' }),
    ]
    show()
    const user = userEvent.setup()
    const list = await screen.findByRole('list', { name: 'Changes to who can do what' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    await user.type(screen.getByRole('searchbox', { name: 'Search the changes' }), 'worship')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('1 of the latest 3.')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search the changes' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search the changes' }), 'asha')
    // Asha made one change, and one is about her.
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('combobox', { name: 'Which changes' }))
    await user.click(screen.getByRole('option', { name: 'Grants' }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByRole('listitem')).toHaveTextContent('Gave Asha Mathew')
    await user.clear(screen.getByRole('searchbox', { name: 'Search the changes' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search the changes' }), 'nothing like this')
    expect(screen.getByText('No change reads like that.')).toBeInTheDocument()
  })

  it('puts a change back: the rule before it, said again', async () => {
    rows.rpc = []
    rows.data = [
      row({ id: 'c1', before: null, after: 'team' }),
      row({ id: 'c2', kind: 'grant', role_key: null, capability: 'page.inventory', user_id: 'asha', after: 'all' }),
      row({ id: 'c3', kind: 'grant', role_key: null, capability: 'page.inventory', user_id: 'gone', after: 'all' }),
    ]
    show()
    const user = userEvent.setup()
    const list = await screen.findByRole('list', { name: 'Changes to who can do what' })
    const items = within(list).getAllByRole('listitem')
    // Somebody since removed cannot be given anything back.
    expect(within(items[2]).queryByRole('button', { name: /Put it back/ })).toBeNull()
    await user.click(within(items[0]).getByRole('button', { name: /^Put it back: Team Member/ }))
    await waitFor(() => expect(rows.rpc).toHaveLength(1))
    expect(rows.rpc[0]).toEqual({ fn: 'set_permissions', args: { p_changes: [{ role: 'member', capability: 'rota.assign', reach: 'none' }] } })
    expect(await within(items[0]).findByRole('status')).toHaveTextContent('Put back.')
    await user.click(within(items[1]).getByRole('button', { name: /^Put it back: Gave Asha/ }))
    await waitFor(() => expect(rows.rpc).toHaveLength(2))
    expect(rows.rpc[1]).toEqual({ fn: 'set_permission_grants', args: { p_changes: [{ capability: 'page.inventory', person: 'asha', reach: null }] } })
  })

  it('offers no Put it back to somebody who cannot change the grid', async () => {
    rows.editable = false
    rows.data = [row({ id: 'c1', before: null, after: 'team' })]
    show()
    await screen.findByRole('list', { name: 'Changes to who can do what' })
    expect(screen.queryByRole('button', { name: /Put it back/ })).toBeNull()
    rows.editable = true
  })
})

describe('putting a change back', () => {
  const until = new Date(Date.now() + 7 * 86400000).toISOString()
  it('says a cell’s reach before, the default where there was no row', () => {
    expect(putBack(row({ before: null, after: 'team' }))).toEqual({
      fn: 'set_permissions',
      args: { p_changes: [{ role: 'member', capability: 'rota.assign', reach: 'none' }] },
    })
    expect(putBack(row({ before: 'all', after: 'team' }))!.args.p_changes[0]).toMatchObject({ reach: 'all' })
    expect(putBack(row({ kind: 'team', department_id: 'w', before: null, after: 'none' }))).toEqual({
      fn: 'set_permissions',
      args: { p_changes: [{ role: 'member', capability: 'rota.assign', reach: null, department: 'w' }] },
    })
  })

  it('gives a grant back as it was, date and Heads-only and all, or takes it back', () => {
    const grant = { kind: 'grant' as const, role_key: null, capability: 'clockin.approve' }
    expect(putBack(row({ ...grant, department_id: 'w', before: 'all', after: null, leads_only_before: true, until_before: until }))).toEqual({
      fn: 'set_permission_grants',
      args: { p_changes: [{ capability: 'clockin.approve', team: 'w', reach: 'all', leads_only: true, until }] },
    })
    expect(putBack(row({ ...grant, user_id: 'asha', before: null, after: 'team' }))).toEqual({
      fn: 'set_permission_grants',
      args: { p_changes: [{ capability: 'clockin.approve', person: 'asha', reach: null }] },
    })
  })

  it('cannot put back a grant that ran out, or a cell the grid no longer has', () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    expect(putBack(row({ kind: 'grant', role_key: null, user_id: 'asha', before: 'all', after: null, until_before: past, changed_by: null }))).toBeNull()
    expect(putBack(row({ capability: 'gone.away', before: null, after: 'team' }))).toBeNull()
    expect(putBack(row({ role_key: 'nobody', before: null, after: 'team' }))).toBeNull()
  })

  it('matches a search against the sentence and who made it', () => {
    const r = row({ kind: 'grant', role_key: null, capability: 'page.inventory', user_id: 'asha', after: 'all', changed_by: 'me' })
    const person = (id: string) => (id === 'asha' ? 'Asha Mathew' : 'Rohit K')
    const team = () => 'Worship'
    expect(changeMatches(r, 'inventory', person, team)).toBe(true)
    expect(changeMatches(r, 'rohit', person, team)).toBe(true)
    expect(changeMatches(r, '  ', person, team)).toBe(true)
    expect(changeMatches(r, 'worship', person, team)).toBe(false)
  })
})
