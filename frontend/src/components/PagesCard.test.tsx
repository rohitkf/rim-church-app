import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PagesCard } from './PagesCard'
import { DEFAULT_SETTINGS } from '../lib/appSettings'
import { SETTINGS_PAGES } from '../lib/pageSettings'
import { decide, type Holder, type Overrides, type TeamOverrides } from '../lib/permissions'

/*
 * Settings › Page by page: each page's settings and rules in one place,
 * the rules a team at a time, and one Save for the lot.
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
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ isAdmin: viewer.admin, isSuperAdmin: viewer.owner, session: { user: { id: 'me' } } }),
}))
vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', handbook_url: null, color: '#a855f7', is_service_flow: false, is_worship: false, created_at: 'x', updated_at: 'x' },
      { id: 'd2', name: 'Worship', handbook_url: null, color: '#ef4444', is_service_flow: false, is_worship: true, created_at: 'x', updated_at: 'x' },
    ]),
}))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))

const db = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  rpc: [] as { fn: string; args: unknown }[],
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: { ...db.row }, error: null }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          db.writes.push(patch)
          return Promise.resolve({ error: null })
        },
      }),
    }),
    rpc: (fn: string, args: unknown) => {
      db.rpc.push({ fn, args })
      return Promise.resolve({ error: null })
    },
  },
}))

beforeEach(() => {
  viewer = { myId: 'me', owner: false, admin: true, ledTeams: [], memberTeams: [] }
  stored = {}
  storedTeams = {}
  db.row = { ...DEFAULT_SETTINGS }
  db.writes = []
  db.rpc = []
})

async function show(at = '/settings/pages') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <PagesCard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('button', { name: /^Team Rota/ })
  return userEvent.setup()
}

// A section's name is the page's, then what it holds; a setting's row can start with the same word.
const section = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}\\s*(\\d|opens|Nothing)`) })
const teamCard = (name: string) =>
  within(screen.getByRole('region', { name: 'Team by team' })).getByRole('button', { name: new RegExp(`^${name}`) })

describe('Page by page', () => {
  it('lists every page as a folded section under the menu’s headings, saying what each holds', async () => {
    await show()
    for (const page of SETTINGS_PAGES) expect(section(page.label)).toHaveAttribute('aria-expanded', 'false')
    for (const heading of ['Home', 'Sunday', 'Talk', 'Everywhere']) expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(section('Team Rota')).toHaveTextContent(/\d+ settings · \d+ rules · opens to Teams/)
    expect(section('Team Chat')).toHaveTextContent('1 setting · 3 rules')
    expect(section('Notifications')).toHaveTextContent('2 settings')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('opens a page to its settings, the room with its own controls, who can open it, each team, and the church’s rule', async () => {
    const user = await show()
    await user.click(section('Team Rota'))
    // Its own settings, as rows — the same rows the Timings room draws.
    expect(screen.getByRole('button', { name: /^Days ahead/ })).toHaveTextContent('7 days')
    expect(screen.getByRole('switch', { name: 'Always show a service somebody is rostered on' })).toBeChecked()
    expect(screen.getByRole('button', { name: /^Services are kept for/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Raising opens before the service/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Settings › Team Rota/ })).toHaveAttribute('href', '/settings/rota')
    expect(screen.getByRole('radiogroup', { name: 'Who can open Team Rota' })).toBeInTheDocument()
    // A card per team, each saying what its profiles may do here.
    // Out of the box a Head may do four of the rota's five: deleting a release request is not theirs.
    expect(teamCard('Media')).toHaveTextContent('Head 4 of 5 · Asst Head 4 of 5 · Coordinator none · Member none')
    expect(teamCard('Worship')).toHaveAttribute('aria-expanded', 'false')
    // And the church-wide grid, a column per profile.
    expect(screen.getByRole('heading', { name: 'For every team — the church’s rule' })).toBeInTheDocument()
    expect(within(screen.getByRole('rowheader', { name: /Assign somebody to a role/ }).closest('tr')!).getByRole('combobox', { name: /Assisting Head$/ })).toHaveValue('team')
  })

  it('gives one team a rule of its own, no wider than the team, and saves it with the team', async () => {
    const user = await show()
    await user.click(section('Team Rota'))
    await user.click(teamCard('Worship'))
    const cell = screen.getByRole('combobox', { name: 'Assign roles — Team Member on Worship' })
    expect(cell).toHaveValue('')
    expect(within(cell).getAllByRole('option').map((o) => o.textContent)).toEqual(['As the church (No)', 'No', 'Team'])
    // Admins are the church’s: no column for them here.
    expect(screen.queryByRole('combobox', { name: /Admin on Worship$/ })).toBeNull()
    await user.selectOptions(cell, 'team')
    expect(teamCard('Worship')).toHaveTextContent('Own rules')
    // Four, not five: deleting a release request is never a member's, so it is not theirs to count.
    expect(teamCard('Worship')).toHaveTextContent('Member 1 of 4')
    expect(screen.getByRole('list', { name: 'Changes to save' })).toHaveTextContent('Worship · Team Member · Assign somebody to a role: As the church → Their team')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0]).toEqual({
      fn: 'set_permissions',
      args: { p_changes: [{ role: 'member', capability: 'rota.assign', reach: 'team', department: 'd2' }] },
    })
    expect(db.writes).toHaveLength(0)
  })

  it('shows a team’s stored rule in force, and lets it follow the church again', async () => {
    storedTeams = { d1: { 'rota.assign': { assistant: 'none' } } }
    const user = await show()
    await user.click(section('Team Rota'))
    expect(teamCard('Media')).toHaveTextContent('Asst Head 3 of 5')
    await user.click(teamCard('Media'))
    const cell = screen.getByRole('combobox', { name: 'Assign roles — Assisting Head on Media' })
    expect(cell).toHaveValue('none')
    await user.selectOptions(cell, '')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0].args).toEqual({ p_changes: [{ role: 'assistant', capability: 'rota.assign', reach: null, department: 'd1' }] })
  })

  it('saves a setting, a page’s opening rule and a church-wide cell together, sending only what moved', async () => {
    const user = await show()
    await user.click(section('Team Rota'))
    await user.click(screen.getByRole('switch', { name: 'Always show a service somebody is rostered on' }))
    await user.click(within(screen.getByRole('radiogroup', { name: 'Who can open Team Rota' })).getByRole('radio', { name: 'Everyone' }))
    const row = screen.getByRole('rowheader', { name: /Assign somebody to a role/ }).closest('tr')!
    await user.selectOptions(within(row).getByRole('combobox', { name: /Team Member$/ }), 'team')
    const changes = screen.getByRole('list', { name: 'Changes to save' })
    expect(changes).toHaveTextContent('Always show a service somebody is rostered on')
    expect(changes).toHaveTextContent('Who can open which pages')
    expect(changes).toHaveTextContent('Team Member · Assign somebody to a role: No → Their team')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toEqual({ always_show_my_services: false, page_access: { rota: 'everyone' } })
    expect(db.rpc[0].args).toEqual({ p_changes: [{ role: 'member', capability: 'rota.assign', reach: 'team' }] })
  })

  it('opens the page an anchor names', async () => {
    await show('/settings/pages#availability')
    expect(section('Availability')).toHaveAttribute('aria-expanded', 'true')
    expect(section('Team Rota')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Closes the night before, at')).toBeInTheDocument()
  })

  it('offers nothing to save to somebody who may only read it', async () => {
    viewer = { ...viewer, admin: false, ledTeams: ['d1'], headTeams: ['d1'] }
    const user = await show()
    await user.click(section('Availability'))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    await user.click(teamCard('Media'))
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })
})
