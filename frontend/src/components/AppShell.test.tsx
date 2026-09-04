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
    profile: { first_name: 'Ada', last_name: 'Grace', email: 'ada@example.com' },
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
      for (const label of ['Inventory', 'Messages', 'Team Chat']) {
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

  it('asks before signing out, rather than just doing it', async () => {
    const user = renderShell()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The account menu owns that button; the shell owns the confirmation.
    expect(screen.getByText('account')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Dashboard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
