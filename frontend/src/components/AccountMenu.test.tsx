import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AccountMenu } from './AccountMenu'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    profile: { first_name: 'Sarah', last_name: 'Jenkins', email: 's@x.com' },
    roles: [{ role_type: 'department_head' }],
    isAdmin: false,
  }),
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
    expect(screen.getByText('Department Head')).toBeInTheDocument()
  })
})
