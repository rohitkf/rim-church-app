import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { OverwatchCard } from './OverwatchCard'
import { NavNamesContext } from '../lib/navNames'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))

const db = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  overrides: {} as Record<string, Record<string, string>>,
  rpc: [] as { fn: string; args: unknown }[],
}))
// Overwatch's five are its cells in the grid (0214).
vi.mock('../lib/usePermissions', () => ({
  PERMISSIONS_KEY: ['role-permissions'],
  usePermissions: () => ({ can: () => true, overrides: db.overrides, teams: {}, grants: [] }),
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
  db.overrides = {}
  db.rpc = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NavNamesContext.Provider value={{}}>
          <OverwatchCard />
        </NavNamesContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('Settings › Overwatch', () => {
  it('opens every page but Volunteers to begin with, and keeps the everyone-pages open', async () => {
    show()
    const list = await screen.findByRole('list', { name: 'Pages Overwatch can open' })
    expect(within(list).getByRole('switch', { name: 'Overwatch can open Volunteers' })).not.toBeChecked()
    expect(within(list).getByRole('switch', { name: 'Overwatch can open Team Chat' })).toBeChecked()
    // Open to everyone signed in, so no switch to turn off.
    expect(within(list).queryByRole('switch', { name: /Service Planner/ })).toBeNull()
    expect(within(list).getByText('Service Planner').closest('li')).toHaveTextContent('Open')
  })

  it('saves a closed page to the settings, and a turned-off switch as Overwatch’s cell in the grid', async () => {
    const user = show()
    await user.click(await screen.findByRole('switch', { name: 'Overwatch can open Team Chat' }))
    await user.click(screen.getByRole('switch', { name: 'Overwatch may ask polls' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toEqual({ overwatch_pages: { volunteers: false, 'team-chat': false } })
    expect(db.rpc).toEqual([
      { fn: 'set_permissions', args: { p_changes: [{ role: 'overwatch', capability: 'msg.polls', reach: 'none' }] } },
    ])
  })

  it('shows what the grid holds, and turns a cell back on', async () => {
    db.overrides = { 'issue.as_overwatch': { overwatch: 'none' } }
    const user = show()
    const issues = await screen.findByRole('switch', { name: 'Overwatch may raise issues' })
    expect(issues).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Overwatch may post in team chats' })).toBeChecked()
    await user.click(issues)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.rpc).toHaveLength(1))
    expect(db.rpc[0].args).toEqual({ p_changes: [{ role: 'overwatch', capability: 'issue.as_overwatch', reach: 'all' }] })
    // Nothing of the room's own changed, so nothing of it is written.
    expect(db.writes).toEqual([])
  })
})
