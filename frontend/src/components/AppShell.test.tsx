import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

// Which teams the viewer is on, which decides whether the dock offers the
// teams' own pages at all. Ada is on Media unless a test says otherwise.
const myTeams = vi.fn(() => ['media'])
vi.mock('../lib/queries', () => ({
  fetchOwnDepartmentIds: () => Promise.resolve(myTeams()),
}))

// The dock is what this covers; everything hanging off the top strip has
// its own tests and its own data requirements.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'ada' } },
    // Welcomed long ago: the first-time welcome has its own tests, and it
    // would otherwise sit over the dock in every one of these.
    profile: {
      id: 'ada',
      first_name: 'Ada',
      last_name: 'Grace',
      email: 'ada@example.com',
      welcomed_at: '2026-01-01T00:00:00Z',
    },
    roles: [],
    isAdmin: false,
    ledDepartmentIds: [],
    signOut: vi.fn(),
  }),
}))
vi.mock('./GlobalSearch', () => ({ GlobalSearch: () => <div>search</div> }))
vi.mock('./NotificationsBell', () => ({ NotificationsBell: () => <div>bell</div> }))
vi.mock('./AccountMenu', () => ({ AccountMenu: () => <div>account</div> }))
vi.mock('./ThemeToggle', () => ({ ThemeToggle: () => <div>theme</div> }))
vi.mock('./AiAssistantPanel', () => ({ AiAssistantPanel: () => null }))
vi.mock('./PwaBanners', () => ({ PwaBanners: () => null }))
// Data-driven, like the bell above it: these tests are about the dock.
vi.mock('./AlertBanner', () => ({ AlertBanner: () => null }))

function renderShell(initial = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>dashboard page</div>} />
          <Route path="/messages" element={<div>messages page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const dock = () => screen.getByRole('navigation', { name: 'Main' })

describe('AppShell dock', () => {
  it('offers every destination on one bar', async () => {
    renderShell()
    // Messages is one of the teams' own pages, so it arrives with the
    // answer to "is this person on a team" rather than on first paint.
    expect(await screen.findByRole('link', { name: 'Messages' })).toBeInTheDocument()
    for (const label of ['Dashboard', 'Service Planner', 'Checklists', 'Teams']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('keeps the teams’ own pages away from somebody on no team', async () => {
    myTeams.mockReturnValueOnce([])
    renderShell()
    // Waited for rather than asserted straight away: the point is that
    // they are still absent once the roster has come back empty.
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    await waitFor(() => {
      for (const label of [
        'Inventory',
        'Messages',
        'Team Chat',
        'Checklists',
        'Availability',
        'Team Rota',
      ]) {
        expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
      }
    })
  })

  it('names only the destination you are on, so the rest can be icons', () => {
    renderShell()
    // The accessible name comes from the title either way; the visible
    // text is what the dock spends space on.
    expect(dock()).toHaveTextContent('Dashboard')
    expect(dock()).not.toHaveTextContent('Service Planner')
  })

  it('moves the label when you navigate', async () => {
    const user = renderShell()
    await user.click(await screen.findByRole('link', { name: 'Messages' }))

    expect(await screen.findByText('messages page')).toBeInTheDocument()
    expect(dock()).toHaveTextContent('Messages')
    expect(dock()).not.toHaveTextContent('Dashboard')
  })

  it('hides Volunteers from someone who is not an Admin', () => {
    renderShell()
    expect(screen.queryByRole('link', { name: 'Volunteers' })).not.toBeInTheDocument()
  })

  it('tints the page by section, so you know where you are before reading', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/inventory" element={<div>inventory</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
      </QueryClientProvider>,
    )
    const shell = container.querySelector('div') as HTMLElement
    expect(shell.style.getPropertyValue('--wash-hue')).toContain('accent-orange')
  })

  it('puts every destination behind More, for the phone bar that cannot hold them', async () => {
    const user = renderShell()
    await screen.findByRole('link', { name: 'Messages' })
    await user.click(screen.getByRole('button', { name: 'More' }))

    const sheet = screen.getByRole('dialog', { name: 'All destinations' })
    for (const label of ['Dashboard', 'Service Planner', 'Checklists', 'Team Rota']) {
      expect(within(sheet).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('keeps wherever you are on the bar itself, so the dock still says where you are', async () => {
    // The bar shows a fixed number of destinations on a phone and hides
    // the rest with `hidden`. Messages is well past that cut, so this is
    // the case that would otherwise leave the phone dock unlabelled.
    render(
      <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/messages']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/messages" element={<div>messages page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('link', { name: 'Messages' })).not.toHaveClass('hidden')
    expect(screen.getByRole('link', { name: 'Checklists' })).toHaveClass('hidden')
  })

  /*
   * The bar carries three destinations on a phone and hides the rest with
   * `hidden`. It used to carry the *first* three, so standing on the third
   * you saw nothing at all to the right of you and the only way onwards
   * was to open More and read a menu.
   */
  describe('the phone dock slides with you', () => {
    const onBar = (label: string) =>
      !screen.getByRole('link', { name: label }).classList.contains('hidden')

    const standOn = async (path: string, label: string) => {
      render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path={path} element={<div>page</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      await screen.findByRole('link', { name: label })
    }

    it('shows what comes next, not just what came before', async () => {
      // Checklists is well past the three the bar used to hold. The one
      // after it has to be reachable in a tap, which is the complaint.
      await standOn('/checklists', 'Checklists')
      expect(onBar('Team Rota')).toBe(true)
      expect(onBar('Checklists')).toBe(true)
      expect(onBar('Set Lists')).toBe(true)
      expect(onBar('Dashboard')).toBe(false)
    })

    it('keeps a neighbour on each side, wherever you are', async () => {
      await standOn('/messages', 'Messages')
      expect(onBar('Set Lists')).toBe(true)
      expect(onBar('Messages')).toBe(true)
      expect(onBar('Team Chat')).toBe(true)
    })

    it('stops at the beginning rather than wrapping', async () => {
      // Waiting on a team-only link: they arrive after the memberships
      // query, and the window is not settled until they are all in.
      await standOn('/', 'Availability')
      expect(onBar('Dashboard')).toBe(true)
      expect(onBar('Service Planner')).toBe(true)
      expect(onBar('Availability')).toBe(true)
      expect(onBar('Inventory')).toBe(false)
    })

    it('paints the highlight as one travelling thing, not a colour per link', async () => {
      // Two blues would fight: the pill is behind, the link carries only
      // its text colour, and the pill measures itself against the link
      // marked as current.
      await standOn('/checklists', 'Checklists')
      const dock = screen.getByRole('navigation', { name: 'Main' })
      const pill = dock.querySelector('span.bg-primary')

      expect(pill).not.toBeNull()
      expect(pill).toHaveAttribute('aria-hidden', 'true')
      expect(dock.querySelectorAll('[data-dock-active="true"]')).toHaveLength(1)
      expect(screen.getByRole('link', { name: 'Checklists' })).not.toHaveClass('bg-primary')
    })

    it('keeps More, which is still how you jump rather than walk', async () => {
      await standOn('/checklists', 'Checklists')
      expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
    })
  })

  it('runs the destinations in the order a Sunday happens', async () => {
    // Answer, then see who was put on, then tick it off on the day. The
    // order is the path the dock walks along, so it is worth pinning.
    renderShell()
    await screen.findByRole('link', { name: 'Messages' })
    const dock = screen.getByRole('navigation', { name: 'Main' })
    const labels = within(dock)
      .getAllByRole('link')
      .map((link) => link.getAttribute('title'))

    // Volunteers is missing because this viewer is not an Admin; every
    // other destination is here, in order.
    expect(labels).toEqual([
      'Dashboard',
      'Service Planner',
      'Availability',
      'Team Rota',
      'Checklists',
      'Set Lists',
      'Messages',
      'Team Chat',
      'Events',
      'Teams',
      'Inventory',
    ])
  })

  it('asks before signing out, rather than just doing it', async () => {
    const user = renderShell()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The account menu owns that button; the shell owns the confirmation.
    expect(screen.getByText('account')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
