import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Tour } from './Tour'
import { endTour } from '../lib/tour'

/*
 * The tour, walked. The pages here are stubs that carry the anchors the
 * real ones do, which is what the steps point at.
 */

const auth = vi.hoisted(() => ({
  profile: { id: 'me', first_name: 'Ada', last_name: 'Grace', onboarded_at: '2026-10-01T10:00:00Z' } as Record<
    string,
    unknown
  > | null,
  isAdmin: false,
  isSuperAdmin: false,
  viewAs: null as unknown,
}))
const access = vi.hoisted(() => ({ standing: 'church', settled: true, open: null as Set<string> | null }))
const teams = vi.hoisted(() => ({ onATeam: false, settled: true }))
const db = vi.hoisted(() => ({
  row: null as { user_id: string; seen: Record<string, string>; pushed_at: string | null } | null,
  marked: [] as string[][],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/usePageAccess', () => ({
  usePageAccess: () => ({
    standing: access.standing,
    settled: access.settled,
    canOpen: (path: string) => (access.open ? access.open.has(path) : true),
  }),
}))
vi.mock('../lib/useMyTeams', () => ({ useMyTeams: () => teams }))
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }))
vi.mock('../lib/onboarding', async () => {
  const actual = await vi.importActual<typeof import('../lib/onboarding')>('../lib/onboarding')
  return {
    ...actual,
    fetchMyOnboarding: () => Promise.resolve(db.row),
    markChaptersSeen: (keys: string[]) => {
      db.marked.push(keys)
      return Promise.resolve()
    },
  }
})

function Page({ name }: { name: string }) {
  const { pathname } = useLocation()
  return (
    <div>
      <header data-tour="page-title">{name}</header>
      <p data-testid="where">{pathname}</p>
      {pathname === '/' && <div data-tour="dock">the dock</div>}
      {pathname === '/' && <button data-tour="search">search</button>}
      {pathname === '/' && <button data-tour="bell">bell</button>}
      {pathname === '/' && <button data-tour="account">account</button>}
      {pathname === '/departments' && <div data-tour="join-team">join</div>}
      {['/availability', '/rota', '/checklists'].includes(pathname) && <nav data-tour="serving-tabs">tabs</nav>}
    </div>
  )
}

function show(at = '/') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          {['/', '/service-planner', '/events', '/updates', '/polls', '/giving', '/feedback', '/stage', '/settings/profile', '/departments', '/availability', '/rota', '/checklists', '/messages', '/team-chat', '/set-lists', '/inventory', '/debriefs', '/issues'].map(
            (p) => (
              <Route key={p} path={p} element={<Page name={p} />} />
            ),
          )}
        </Routes>
        <Tour />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const dialog = () => screen.getByRole('dialog')

beforeEach(() => {
  endTour()
  auth.profile = { id: 'me', first_name: 'Ada', last_name: 'Grace', onboarded_at: '2026-10-01T10:00:00Z' }
  auth.isSuperAdmin = false
  auth.viewAs = null
  access.standing = 'church'
  access.settled = true
  access.open = null
  teams.onATeam = false
  teams.settled = true
  db.row = null
  db.marked = []
})

describe('starting itself', () => {
  it('welcomes a brand-new account by name, with the whole Church Member tour', async () => {
    show()
    expect(await screen.findByText('Welcome, Ada.')).toBeInTheDocument()
    expect(dialog().textContent).toContain('Welcome · Part 1 of 3')
  })

  it('does nothing for somebody who has seen it all', async () => {
    db.row = { user_id: 'me', seen: { welcome: 'x', around: 'x', church: 'x' }, pushed_at: null }
    show()
    await screen.findByTestId('where')
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a new Team Member only the chapters they have gained, starting on Serving', async () => {
    access.standing = 'member'
    teams.onATeam = true
    db.row = { user_id: 'me', seen: { welcome: 'x', around: 'x', church: 'x' }, pushed_at: null }
    show()
    expect(await screen.findByText('Serving, in three steps')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/availability')
    expect(dialog().textContent).toContain('Your Sunday · Part 1 of 3')
  })

  it('starts over from the welcome when the tour was sent after it was seen', async () => {
    const seen = Object.fromEntries(['welcome', 'around', 'church'].map((k) => [k, '2026-10-01T10:00:00Z']))
    db.row = { user_id: 'me', seen, pushed_at: '2026-10-05T10:00:00Z' }
    show()
    expect(await screen.findByText('Welcome, Ada.')).toBeInTheDocument()
  })

  it('waits until it knows who it is talking to', async () => {
    access.settled = false
    show()
    await screen.findByTestId('where')
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never tours an Admin as the person they are previewing', async () => {
    auth.viewAs = { as: 'church' }
    show()
    await screen.findByTestId('where')
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('walking it', () => {
  it('goes step by step, page by page, and marks each chapter seen as it is finished', async () => {
    const user = userEvent.setup()
    db.row = { user_id: 'me', seen: { welcome: 'x', around: 'x' }, pushed_at: null }
    show()
    // The church chapter opens on the Service Planner, having gone there.
    expect(await screen.findByText('Service Planner')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/service-planner')
    expect(dialog().textContent).toContain('What’s on · Part 1 of 1')

    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('Events')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/events')

    // Back goes back.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Service Planner')).toBeInTheDocument()

    // Through to the end: nine steps for somebody on no team.
    for (let i = 0; i < 9; i += 1) await user.click(await screen.findByRole('button', { name: /Next/ }))
    expect(await screen.findByText('That’s the tour.')).toBeInTheDocument()
    expect(db.marked).toEqual([['church']])

    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('offers to skip this part or the whole thing, and marks what was skipped', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Welcome, Ada.')
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByText('Skip what?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'This part' }))
    expect(await screen.findByText('The dock')).toBeInTheDocument()
    expect(db.marked).toEqual([['welcome']])

    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'The whole tour' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(db.marked).toEqual([['welcome'], ['around', 'church']])
  })

  it('changes its mind about skipping', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Welcome, Ada.')
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    await user.click(screen.getByRole('button', { name: 'Keep going' }))
    expect(screen.getByText('Welcome, Ada.')).toBeInTheDocument()
    expect(db.marked).toEqual([])
  })

  it('walks with the arrow keys, and Escape asks', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByText('Welcome, Ada.')
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByText('How a Sunday works here')).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}')
    expect(await screen.findByText('Welcome, Ada.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByText('Skip what?')).toBeInTheDocument()
  })

  it('points at the thing on the page, and dims the rest', async () => {
    const user = userEvent.setup()
    db.row = { user_id: 'me', seen: { welcome: 'x' }, pushed_at: null }
    show()
    expect(await screen.findByText('The dock')).toBeInTheDocument()
    // The welcome had no anchor; this step has one, so the dark has a hole.
    const overlay = document.querySelector('[data-tour-overlay]')!
    await waitFor(() => expect(overlay.querySelector('.ring-primary')).not.toBeNull())
    await user.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('Search anything')).toBeInTheDocument()
  })
})
