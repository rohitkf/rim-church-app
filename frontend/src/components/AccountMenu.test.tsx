import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AccountMenu } from './AccountMenu'

const settings = vi.hoisted(() => ({ video_tutorial_url: null as string | null }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => settings }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    profile: { first_name: 'Sarah', last_name: 'Jenkins', email: 's@x.com' },
    roles: [{ role_type: 'department_head' }],
    isAdmin: false,
  }),
}))

const pwa = vi.hoisted(() => ({ applied: 0 }))
vi.mock('../lib/pwa', async (original) => ({
  ...(await original<typeof import('../lib/pwa')>()),
  applyUpdate: () => {
    pwa.applied += 1
  },
}))

const renderMenu = (onSignOut = vi.fn()) => {
  render(
    <MemoryRouter>
      <AccountMenu initials="SJ" onSignOut={onSignOut} />
    </MemoryRouter>,
  )
  return { onSignOut, user: userEvent.setup() }
}

describe('AccountMenu', () => {
  it('stays shut until the avatar is clicked', async () => {
    const { user } = renderMenu()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
  })

  it('reloads the app — onto a waiting update if there is one — from just above Settings', async () => {
    const { user } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())
    expect(items.indexOf('Reload')).toBe(items.indexOf('Settings') - 1)
    await user.click(screen.getByRole('menuitem', { name: 'Reload' }))
    expect(pwa.applied).toBe(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('asks the shell to confirm rather than signing out on the spot', async () => {
    const { onSignOut, user } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('menuitem', { name: /log out/i }))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const { user } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('the role badge', () => {
  it('says what this person is allowed to do', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <AccountMenu initials="SJ" onSignOut={() => {}} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /account/i }))
    // The sidebar used to say this under the church's name; when the
    // sidebar went, the app stopped telling anyone their own role.
    expect(screen.getByText('Team Head')).toBeInTheDocument()
  })

  it('offers the two ways of drawing a team, remembering the choice', async () => {
    const { user } = renderMenu()
    await user.click(screen.getByRole('button', { name: 'Account' }))

    const dot = screen.getByRole('button', { name: 'Dot' })
    expect(screen.getByRole('button', { name: 'Gradient' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(dot)
    expect(dot).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('rim-team-style')).toBe('dot')
  })
})

describe('the Video tutorial link', () => {
  const open = async () => {
    render(
      <MemoryRouter>
        <AccountMenu initials="RK" onSignOut={() => undefined} />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: /account|menu|RK/i }))
  }

  it('is not there without a link', async () => {
    settings.video_tutorial_url = null
    await open()
    expect(screen.queryByRole('menuitem', { name: 'Video tutorial' })).toBeNull()
  })

  it('opens the Owner’s link in a new tab', async () => {
    settings.video_tutorial_url = 'https://youtu.be/abc'
    await open()
    const link = screen.getByRole('menuitem', { name: 'Video tutorial' })
    expect(link).toHaveAttribute('href', 'https://youtu.be/abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('never offers a link that is not http(s)', async () => {
    settings.video_tutorial_url = 'javascript:alert(1)'
    await open()
    expect(screen.queryByRole('menuitem', { name: 'Video tutorial' })).toBeNull()
  })
})
