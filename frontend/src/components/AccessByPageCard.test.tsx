import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccessByPageCard } from './AccessByPageCard'
import { PERMISSIONS, ROLES } from '../lib/permissionMatrix'
import { decide, type Holder, type Overrides, type TeamOverrides } from '../lib/permissions'

/*
 * Access, a page at a time: each page's section carries who can open it
 * and what each profile may do on it, and a team can be given rules of
 * its own (0162).
 */

let viewer: Holder = { myId: 'me', owner: false, admin: true, ledTeams: [], memberTeams: [] }
let stored: Overrides = {}
let storedTeams: TeamOverrides = {}

vi.mock('../lib/usePermissions', () => ({
  usePermissions: () => ({
    can: (cap: Parameters<typeof decide>[2], where?: Parameters<typeof decide>[3]) =>
      decide(stored, viewer, cap, where, storedTeams),
    overrides: stored,
    teams: storedTeams,
  }),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: viewer.admin, isSuperAdmin: viewer.owner }) }))
vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', handbook_url: null, color: null, is_service_flow: false, is_worship: false, created_at: 'x', updated_at: 'x' },
      { id: 'd2', name: 'Worship', handbook_url: null, color: null, is_service_flow: false, is_worship: true, created_at: 'x', updated_at: 'x' },
    ]),
}))
vi.mock('../lib/appSettings', () => ({
  useAppSettings: () => ({ page_access: {}, issues_raise_scope: 'teams' }),
}))
const room = vi.hoisted(() => ({
  draft: { page_access: {} as Record<string, string> },
  set: vi.fn((_key: string, value: Record<string, string>) => {
    room.draft = { page_access: value }
  }),
  changed: false,
  save: vi.fn(async () => {}),
  saving: false,
  saved: false,
  error: null as string | null,
  query: { isLoading: false, error: null },
}))
vi.mock('../lib/useSettingsDraft', () => ({ useSettingsDraft: () => room }))

const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ error: null as null | { message: string } }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: { rpc: (fn: string, args: unknown) => rpc(fn, args) },
}))

beforeEach(() => {
  viewer = { myId: 'me', owner: false, admin: true, ledTeams: [], memberTeams: [] }
  stored = {}
  storedTeams = {}
  room.draft = { page_access: {} }
  room.changed = false
  rpc.mockClear()
  room.set.mockClear()
})

const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AccessByPageCard areas={PERMISSIONS} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const section = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const rowFor = (action: string) => screen.getByRole('rowheader', { name: new RegExp(action) }).closest('tr')!

describe('AccessByPageCard', () => {
  it('lists one folded section per page, saying which pages it is about', () => {
    show()
    expect(screen.getAllByRole('listitem', { name: '' }).length).toBeGreaterThan(0)
    for (const area of PERMISSIONS) expect(section(area.area)).toHaveAttribute('aria-expanded', 'false')
    expect(section('Availability')).toHaveTextContent('Serving · Availability')
    expect(section('Messages, polls & updates')).toHaveTextContent('Messages · Team Chat · Church Updates · Polls')
  })

  it('opens a section to who can open it and a column per profile, Assisting Head among them', async () => {
    const user = show()
    await user.click(section('Team rota'))
    expect(screen.getByRole('radiogroup', { name: 'Who can open Serving · Team Rota' })).toBeInTheDocument()
    for (const role of ROLES) expect(screen.getByRole('columnheader', { name: role.label })).toBeInTheDocument()
    const assign = within(rowFor('Assign somebody to a role'))
    expect(assign.getByRole('combobox', { name: /Assisting Head$/ })).toHaveValue('team')
  })

  it('changes the church’s rule from the section, and says what will be saved', async () => {
    const user = show()
    await user.click(section('Availability'))
    const history = within(rowFor('See the history of somebody’s answers'))
    await user.selectOptions(history.getByRole('combobox', { name: /Team Member$/ }), 'team')
    expect(screen.getByRole('list', { name: 'Changes to save' })).toHaveTextContent('Team Member · See the history of somebody’s answers: No → Their team')
    await user.click(screen.getByRole('button', { name: 'Save access' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_permissions', {
        p_changes: [{ role: 'member', capability: 'avail.history', reach: 'team' }],
      }),
    )
  })

  it('gives one team rules of its own, no wider than the team, and sends them with the team', async () => {
    const user = show()
    await user.click(section('Availability'))
    await screen.findByRole('option', { name: 'Worship' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Whose rules' }), 'd2')
    expect(screen.getByText(/Worship’s own rules/)).toBeInTheDocument()
    const edit = within(rowFor('Change somebody else’s answer'))
    const member = edit.getByRole('combobox', { name: /Team Member on Worship$/ })
    expect(member).toHaveValue('')
    expect(within(member).getAllByRole('option').map((o) => o.textContent)).toEqual(['As the church (No)', 'No', 'Team'])
    // An Admin is the church's: no cell to set.
    expect(edit.queryByRole('combobox', { name: /Admin on Worship$/ })).toBeNull()
    await user.selectOptions(member, 'team')
    expect(screen.getByRole('list', { name: 'Changes to save' })).toHaveTextContent('Worship · Team Member · Change somebody else’s answer, and mark who turned up: As the church → Their team')
    await user.click(screen.getByRole('button', { name: 'Save access' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_permissions', {
        p_changes: [{ role: 'member', capability: 'avail.edit_others', reach: 'team', department: 'd2' }],
      }),
    )
  })

  it('shows a team’s stored rule, and gives it back to the church as null', async () => {
    storedTeams = { d1: { 'avail.history': { assistant: 'none' } } }
    const user = show()
    await user.click(section('Availability'))
    await screen.findByRole('option', { name: 'Media' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Whose rules' }), 'd1')
    const history = within(rowFor('See the history of somebody’s answers'))
    const assistant = history.getByRole('combobox', { name: /Assisting Head on Media$/ })
    expect(assistant).toHaveValue('none')
    await user.selectOptions(assistant, '')
    await user.click(screen.getByRole('button', { name: 'Save access' }))
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('set_permissions', {
        p_changes: [{ role: 'assistant', capability: 'avail.history', reach: null, department: 'd1' }],
      }),
    )
  })

  it('saves who can open a page alongside the rules', async () => {
    const user = show()
    await user.click(section('Team rota'))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Who can open Serving · Team Rota' })).getByRole('radio', { name: 'Everyone' }))
    expect(room.set).toHaveBeenCalledWith('page_access', { rota: 'everyone' })
    room.changed = true
  })

  it('offers no controls to somebody who may only read it', async () => {
    viewer = { ...viewer, admin: false, ledTeams: ['d1'], headTeams: ['d1'] }
    const user = show()
    expect(screen.queryByRole('combobox', { name: 'Whose rules' })).toBeNull()
    await user.click(section('Availability'))
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Save access' })).toBeNull()
  })
})
