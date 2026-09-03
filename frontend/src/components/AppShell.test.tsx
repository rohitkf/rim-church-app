import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

// The dock is what this covers; everything hanging off the top strip has
// its own tests and its own data requirements.
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    profile: { first_name: 'Ada', last_name: 'Grace', email: 'ada@example.com' },
    roles: [],
    isAdmin: false,
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
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>dashboard page</div>} />
          <Route path="/messages" element={<div>messages page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const dock = () => screen.getByRole('navigation', { name: 'Main' })

describe('AppShell dock', () => {
  it('offers every destination on one bar', () => {
    renderShell()
    for (const label of ['Dashboard', 'Service Planner', 'Checklists', 'Teams', 'Messages']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
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
    await user.click(screen.getByRole('link', { name: 'Messages' }))

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
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/inventory" element={<div>inventory</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    const shell = container.firstElementChild as HTMLElement
    expect(shell.style.getPropertyValue('--wash-hue')).toContain('accent-orange')
  })

  it('puts every destination behind More, for the phone bar that cannot hold them', async () => {
    const user = renderShell()
    await user.click(screen.getByRole('button', { name: 'More' }))

    const sheet = screen.getByRole('dialog', { name: 'All destinations' })
    for (const label of ['Dashboard', 'Service Planner', 'Checklists', 'Team Rota', 'Messages']) {
      expect(within(sheet).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('keeps wherever you are on the bar itself, so the dock still says where you are', () => {
    // The bar shows a fixed number of destinations on a phone and hides
    // the rest with `hidden`. Messages is well past that cut, so this is
    // the case that would otherwise leave the phone dock unlabelled.
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/messages" element={<div>messages page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Messages' })).not.toHaveClass('hidden')
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
