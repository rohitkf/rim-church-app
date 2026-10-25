import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OverwatchCard } from './OverwatchCard'
import { NavNamesContext } from '../lib/navNames'
import { DEFAULT_SETTINGS } from '../lib/appSettings'

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, session: { user: { id: 'me' } } }) }))

const db = vi.hoisted(() => ({ row: {} as Record<string, unknown>, writes: [] as Record<string, unknown>[] }))
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
  },
}))

beforeEach(() => {
  db.row = { ...DEFAULT_SETTINGS }
  db.writes = []
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <NavNamesContext.Provider value={{}}>
        <OverwatchCard />
      </NavNamesContext.Provider>
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

  it('saves a closed page and a turned-off switch, and only those', async () => {
    const user = show()
    await user.click(await screen.findByRole('switch', { name: 'Overwatch can open Team Chat' }))
    await user.click(screen.getByRole('switch', { name: 'Overwatch may ask polls' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    expect(db.writes[0]).toEqual({
      overwatch_pages: { volunteers: false, 'team-chat': false },
      overwatch_polls: false,
    })
  })
})
