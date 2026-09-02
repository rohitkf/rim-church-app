import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SettingsPage } from './SettingsPage'

let standing = { isAdmin: false, isSuperAdmin: false }

vi.mock('../auth/AuthContext', () => ({ useAuth: () => standing }))

vi.mock('../components/PermissionsCard', () => ({ PermissionsCard: () => <p>permissions</p> }))
vi.mock('../components/AppSettingsCard', () => ({ AppSettingsCard: () => <p>app settings</p> }))
vi.mock('../components/AdminResetCard', () => ({ AdminResetCard: () => <p>erase</p> }))

function show(as: Partial<typeof standing> = {}) {
  standing = { isAdmin: false, isSuperAdmin: false, ...as }
  render(
    <MemoryRouter initialEntries={['/settings/profile']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />}>
          <Route path="profile" element={<p>profile pane</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByRole('navigation', { name: 'Settings sections' })
}

describe('SettingsPage', () => {
  it('shows an ordinary member their profile and nothing else', () => {
    // A menu of doors that will not open is worse than no menu: it invites
    // somebody to ask why they cannot go through them.
    const nav = show()
    expect(within(nav).getByRole('link', { name: /Profile/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Access/ })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /App settings/ })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Erase/ })).not.toBeInTheDocument()
  })

  it('gives an Admin the two they run, and not the one that erases everything', () => {
    const nav = show({ isAdmin: true })
    expect(within(nav).getByRole('link', { name: /Access/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /App settings/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Erase/ })).not.toBeInTheDocument()
  })

  it('gives the Owner every room, erasing included', () => {
    const nav = show({ isAdmin: true, isSuperAdmin: true })
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
    expect(within(nav).getByRole('link', { name: /Erase data/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Send an alert/ })).toBeInTheDocument()
  })

  it('renders the section that was asked for', () => {
    show()
    expect(screen.getByText('profile pane')).toBeInTheDocument()
  })

  it('marks the section you are on, so the menu says where you are', () => {
    const nav = show()
    expect(within(nav).getByRole('link', { name: /Profile/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
