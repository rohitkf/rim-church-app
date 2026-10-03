import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SettingsPage } from './SettingsPage'
import { ChurchSettingsRedirect } from './ChurchSettingsRedirect'
import { SETTINGS_SECTIONS } from '../lib/settingsSections'

let standing = { isAdmin: false, isSuperAdmin: false }
const profile = { first_name: 'Grace', last_name: 'Mensah', email: 'grace@example.test' }

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ ...standing, profile }) }))

vi.mock('../components/PermissionsCard', () => ({ PermissionsCard: () => <p>permissions</p> }))
vi.mock('../components/AppSettingsCard', () => ({ AppSettingsCard: () => <p>app settings</p> }))
vi.mock('../components/AdminResetCard', () => ({ AdminResetCard: () => <p>erase</p> }))

function Where() {
  return <p data-testid="where">{useLocation().pathname + useLocation().hash}</p>
}

function show(at: string, as: Partial<typeof standing> = {}) {
  standing = { isAdmin: false, isSuperAdmin: false, ...as }
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />}>
          <Route index element={null} />
          {SETTINGS_SECTIONS.map((s) => (
            <Route key={s.to} path={s.to.replace('/settings/', '')} element={<p>{s.label} pane</p>} />
          ))}
          <Route path="church" element={<ChurchSettingsRedirect />} />
        </Route>
      </Routes>
      <Where />
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const roomLinks = () =>
  screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('href')?.startsWith('/settings/') && !a.getAttribute('aria-label'))

describe('the Settings hall', () => {
  it('greets you, and your profile is one tap away', () => {
    show('/settings')
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    const me = screen.getByRole('link', { name: 'Your profile: Grace Mensah' })
    expect(me).toHaveAttribute('href', '/settings/profile')
    expect(within(me).getByText('Hi, Grace')).toBeInTheDocument()
  })

  it('shows an ordinary member their own rooms and nothing else', () => {
    // A menu of doors that will not open is worse than no menu: it invites
    // somebody to ask why they cannot go through them.
    show('/settings')
    expect(roomLinks().map((a) => a.getAttribute('href'))).toEqual([
      '/settings/profile',
      '/settings/appearance',
    ])
    // And no heading over a group they have nothing in.
    expect(screen.queryByRole('heading', { name: 'Church set-up' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Owner only' })).toBeNull()
  })

  it('gives an Admin the church’s set-up and people tools, but not the owner’s', () => {
    show('/settings', { isAdmin: true })
    for (const heading of ['You', 'Church set-up', 'People']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.queryByRole('heading', { name: 'Owner only' })).toBeNull()
    const hrefs = roomLinks().map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(
      expect.arrayContaining(['/settings/timings', '/settings/rota', '/settings/giving', '/settings/menu']),
    )
    expect(hrefs).not.toContain('/settings/data')
    expect(hrefs).not.toContain('/settings/logo')
  })

  it('gives the Owner every room, erasing included, under its own heading', () => {
    show('/settings', { isAdmin: true, isSuperAdmin: true })
    expect(roomLinks()).toHaveLength(SETTINGS_SECTIONS.length)
    const owner = screen.getByRole('heading', { name: 'Owner only' }).closest('section')!
    expect(within(owner).getByRole('link', { name: /Erase data/ })).toBeInTheDocument()
    expect(within(owner).getByRole('link', { name: /App logo/ })).toBeInTheDocument()
  })

  it('says what each room is for in a line', () => {
    show('/settings', { isAdmin: true })
    expect(
      within(screen.getByRole('link', { name: /Timings/ })).getByText('When things open, close and clear.'),
    ).toBeInTheDocument()
  })
})

describe('a Settings room', () => {
  it('renders the room that was asked for, under its own title', () => {
    show('/settings/profile')
    expect(screen.getByText('Profile pane')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
  })

  it('carries a way back to the hall', async () => {
    const user = show('/settings/appearance')
    await user.click(screen.getByRole('link', { name: 'All settings' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/settings$/)
  })

  it('keeps the hall beside it as a grouped sidebar, marking where you are', () => {
    show('/settings/giving', { isAdmin: true })
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByText('Church set-up')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Giving' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).queryByRole('link', { name: 'Erase data' })).toBeNull()
  })

  it('sends somebody without the key back to the hall rather than an empty room', () => {
    show('/settings/timings')
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/settings$/)
    expect(screen.queryByText('Timings pane')).toBeNull()
  })

  it('keeps the erase room to the Owner, whatever an Admin types', () => {
    show('/settings/data', { isAdmin: true })
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/settings$/)
  })
})

describe('the old App settings address', () => {
  it.each([
    ['/settings/church', '/settings/timings'],
    ['/settings/church#rota', '/settings/rota'],
    ['/settings/church#giving', '/settings/giving'],
    ['/settings/church#menu', '/settings/menu'],
  ])('%s lands in %s', (from, to) => {
    show(from, { isAdmin: true })
    expect(screen.getByTestId('where')).toHaveTextContent(new RegExp(`^${to}$`))
  })
})
