import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'

// The shell's navigation is what this covers; everything hanging off the
// top bar has its own tests and its own data requirements.
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
vi.mock('./AiAssistantPanel', () => ({ AiAssistantPanel: () => null }))
vi.mock('./PwaBanners', () => ({ PwaBanners: () => null, InstallAppButton: () => null }))

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

const drawer = () => document.getElementById('app-navigation')!

describe('AppShell navigation drawer', () => {
  it('keeps the drawer off-screen until it is asked for', () => {
    renderShell()
    expect(drawer().className).toContain('-translate-x-full')
  })

  it('opens on the menu button', async () => {
    const user = renderShell()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    expect(drawer().className).toContain('translate-x-0')
  })

  it('closes itself once you have arrived somewhere', async () => {
    const user = renderShell()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    await user.click(screen.getByRole('link', { name: 'Messages' }))

    expect(await screen.findByText('messages page')).toBeInTheDocument()
    expect(drawer().className).toContain('-translate-x-full')
  })

  it('closes on Escape', async () => {
    const user = renderShell()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    await user.keyboard('{Escape}')
    expect(drawer().className).toContain('-translate-x-full')
  })

  it('closes when the page behind it is tapped', async () => {
    const user = renderShell()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    await user.click(screen.getByRole('button', { name: /close navigation/i }))
    expect(drawer().className).toContain('-translate-x-full')
  })

  it('stops the page behind scrolling while the drawer is open', async () => {
    const user = renderShell()
    await user.click(screen.getByRole('button', { name: /open navigation/i }))
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('hides the Volunteers page from someone who is not an Admin', () => {
    renderShell()
    expect(screen.queryByRole('link', { name: 'Volunteers' })).not.toBeInTheDocument()
  })
})
