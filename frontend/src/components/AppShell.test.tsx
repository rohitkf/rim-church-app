import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'

// Which teams the viewer is on, which decides whether the dock offers the
// teams' own pages at all. Ada is on Media unless a test says otherwise.
const myTeams = vi.fn(() => ['media'])
vi.mock('../lib/queries', () => ({
  fetchOwnMemberships: () =>
    Promise.resolve((myTeams()).map((department_id: string) => ({ department_id, member_type: 'core' }))),
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
    // Chat holds the teams' own pages, so it arrives with the answer to
    // "is this person on a team" rather than on first paint.
    expect(await screen.findByRole('link', { name: 'Chat' })).toBeInTheDocument()
    for (const label of ['Dashboard', 'Calendar', 'Availability', 'Team Rota', 'Checklists', 'Teams']) {
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
        'Chat',
        'Messages',
        'Team Chat',
        'Checklists',
        'Availability',
        'Team Rota',
      ]) {
        expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument()
      }
      // What the church says and asks is for everybody.
      expect(screen.getByRole('link', { name: 'Church Updates' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Polls' })).toBeInTheDocument()
    })
  })

  it('names only the destination you are on, so the rest can be icons', () => {
    renderShell()
    // The accessible name comes from the title either way; the visible
    // text is what the dock spends space on.
    expect(dock()).toHaveTextContent('Dashboard')
    expect(dock()).not.toHaveTextContent('Calendar')
  })

  it('moves the label when you navigate', async () => {
    const user = renderShell()
    await user.click(await screen.findByRole('link', { name: 'Chat' }))

    expect(await screen.findByText('messages page')).toBeInTheDocument()
    expect(dock()).toHaveTextContent('Chat')
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
    await screen.findByRole('link', { name: 'Chat' })
    await user.click(screen.getByRole('button', { name: 'More' }))

    const sheet = screen.getByRole('dialog', { name: 'All destinations' })
    for (const label of ['Dashboard', 'Calendar', 'Availability', 'Team Rota', 'Checklists', 'Set Lists']) {
      expect(within(sheet).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('groups the More sheet under headings, each page under the one it belongs to', async () => {
    const user = renderShell()
    await screen.findByRole('link', { name: 'Chat' })
    await user.click(screen.getByRole('button', { name: 'More' }))

    const sheet = screen.getByRole('dialog', { name: 'All destinations' })
    const under = (group: string) =>
      within(within(sheet).getByRole('region', { name: group }))
        .getAllByRole('link')
        .map((l) => l.textContent)
    expect(within(sheet).getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'Serving',
      'Services',
      'Communications',
      'Church Life',
      'People & Teams',
    ])
    expect(under('Serving')).toEqual(['Availability', 'Team Rota', 'Checklists'])
    // Songs is a tab of Set Lists, and Debriefs and Issues are one entry.
    expect(under('Services')).toEqual(['Set Lists', 'Stage Layout', 'Countdown', 'After the Service'])
    expect(under('Communications')).toEqual(['Church Updates', 'Chat', 'Polls', 'Feedback'])
  })

  it('keeps wherever you are on the bar itself, so the dock still says where you are', async () => {
    // The bar shows a fixed number of destinations on a phone and hides
    // the rest with `hidden`. Chat is well past that cut, so this is
    // the case that would otherwise leave the phone dock unlabelled.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    onTestFinished(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    })
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
    expect(await screen.findByRole('link', { name: 'Chat' })).not.toHaveClass('hidden')
    expect(screen.getByRole('link', { name: 'Availability' })).toHaveClass('hidden')
  })

  /*
   * The bar carries three destinations on a phone and hides the rest with
   * `hidden`. It used to carry the *first* three, so standing on the third
   * you saw nothing at all to the right of you and the only way onwards
   * was to open More and read a menu.
   */
  describe('the phone dock slides with you', () => {
    // How many the bar carries is worked out from the screen's width now
    // (lib/dockWindow), not from a class that only a phone's CSS obeys, so
    // these have to be a phone. jsdom's own window is 1024 wide.
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    })
    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    })

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
      // Standing on the checklists, the rota they come from is one step
      // back and the one after has to be reachable in a tap.
      await standOn('/checklists', 'Checklists')
      expect(onBar('Team Rota')).toBe(true)
      expect(onBar('Checklists')).toBe(true)
      // After serving come the songs, the last of the Sunday.
      expect(onBar('Set Lists')).toBe(true)
      expect(onBar('Dashboard')).toBe(false)
    })

    it('keeps a neighbour on each side, wherever you are', async () => {
      await standOn('/messages', 'Chat')
      // What the church is saying comes first under Communications, then
      // the teams' chat, then what the church is asking.
      expect(onBar('Church Updates')).toBe(true)
      expect(onBar('Chat')).toBe(true)
      expect(onBar('Polls')).toBe(true)
    })

    it('stops at the beginning rather than wrapping', async () => {
      // Waiting on a team-only link: they arrive after the memberships
      // query, and the window is not settled until they are all in.
      await standOn('/', 'Availability')
      expect(onBar('Dashboard')).toBe(true)
      expect(onBar('Calendar')).toBe(true)
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
    // Answer, get put on, tick it off, then the songs. The order is the
    // path the dock walks along, so it is worth pinning.
    renderShell()
    await screen.findByRole('link', { name: 'Chat' })
    const dock = screen.getByRole('navigation', { name: 'Main' })
    const labels = within(dock)
      .getAllByRole('link')
      .map((link) => link.getAttribute('title'))

    // Volunteers is missing because this viewer is not an Admin; every
    // other destination is here, in order.
    expect(labels).toEqual([
      'Dashboard',
      // Where the services are planned: the Service Planner is not a
      // second entry beside it.
      'Calendar',
      'Availability',
      'Team Rota',
      'Checklists',
      // Songs is a tab of Set Lists.
      'Set Lists',
      'Stage Layout',
      'Countdown',
      // Debriefs and Issues.
      'After the Service',
      'Church Updates',
      // The Message Board and Team Chat.
      'Chat',
      'Polls',
      'Feedback',
      'Prayer Requests',
      'Giving',
      'Teams',
      'Inventory',
    ])
  })

  /*
   * Pages that are one entry in the menu, with tabs between them (the
   * Owner, November 2026). The strip is the shell's, so no page draws it.
   */
  describe('pages that are one entry', () => {
    const openOn = (path: string) =>
      render(
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<div>dashboard page</div>} />
                <Route path="/messages" element={<div>messages page</div>} />
                <Route path="/team-chat" element={<div>team chat page</div>} />
                <Route path="/rota" element={<div>rota page</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )

    it('have a strip of tabs across the top, the one you are on marked', async () => {
      openOn('/team-chat')
      const tabs = await screen.findByRole('navigation', { name: 'Chat' })
      expect(within(tabs).getAllByRole('link').map((l) => l.textContent)).toEqual(['Messages', 'Team Chat'])
      expect(within(tabs).getByRole('link', { name: 'Team Chat' })).toHaveAttribute('aria-current', 'page')
      expect(within(tabs).getByRole('link', { name: 'Messages' })).not.toHaveAttribute('aria-current')
    })

    it('move between them with the tabs, the menu staying on the one entry', async () => {
      const user = userEvent.setup()
      openOn('/messages')
      await user.click(within(await screen.findByRole('navigation', { name: 'Chat' })).getByRole('link', { name: 'Team Chat' }))
      expect(await screen.findByText('team chat page')).toBeInTheDocument()
      const lit = dock().querySelectorAll('[data-dock-active="true"]')
      expect(lit).toHaveLength(1)
      expect(lit[0]).toHaveAttribute('href', '/messages')
      expect(dock()).toHaveTextContent('Chat')
    })

    it('have no strip where there is nothing to switch between', async () => {
      openOn('/rota')
      expect(await screen.findByText('rota page')).toBeInTheDocument()
      await screen.findByRole('link', { name: 'Chat' })
      expect(screen.queryByRole('navigation', { name: 'Chat' })).toBeNull()
    })

    it('have no strip for somebody who may open only one of them', async () => {
      // On no team: the teams' chat is closed, so nothing here is a pair.
      myTeams.mockReturnValue([])
      onTestFinished(() => {
        myTeams.mockReturnValue(['media'])
      })
      openOn('/')
      expect(await screen.findByRole('link', { name: 'Church Updates' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Chat' })).toBeNull()
    })
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

describe('Availability, Team Rota and Checklists', () => {
  it('are each their own destination, current only on their own page', async () => {
    const pages = { '/availability': 'Availability', '/rota': 'Team Rota', '/checklists': 'Checklists' }
    for (const [path, label] of Object.entries(pages)) {
      const { unmount } = render(
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
      expect(await screen.findByRole('link', { name: label }), path).toHaveAttribute('data-dock-active', 'true')
      for (const other of Object.values(pages).filter((l) => l !== label)) {
        expect(screen.getByRole('link', { name: other }), `${path}: ${other}`).not.toHaveAttribute('data-dock-active')
      }
      // The entry that used to hold all three is gone from the menu.
      expect(screen.queryByRole('link', { name: 'Serving' })).toBeNull()
      unmount()
    }
  })
})
