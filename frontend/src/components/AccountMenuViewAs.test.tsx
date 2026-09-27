import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AccountMenu } from './AccountMenu'
import { ViewAsBanner } from './ViewAsBanner'

const auth = vi.hoisted(() => ({
  profile: { first_name: 'Rohit', last_name: 'K', email: 'r@x.com' },
  roles: [{ role_type: 'admin' }],
  isAdmin: true,
  canPreview: true,
  viewAs: null as null | Record<string, string>,
  setViewAs: vi.fn(),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/queries', () => ({
  fetchDepartments: () => Promise.resolve([{ id: 'd1', name: 'Media', color: '#f00' }]),
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ViewAsBanner />
        <AccountMenu initials="RK" onSignOut={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  auth.canPreview = true
  auth.viewAs = null
  auth.setViewAs.mockClear()
})

describe('View as, in the account menu', () => {
  it('offers an Admin a Church Member preview', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('menuitem', { name: 'Church Member' }))
    expect(auth.setViewAs).toHaveBeenCalledWith({ as: 'church' })
  })

  it('asks which team before previewing a Head', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('menuitem', { name: 'Team Head…' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Media' }))
    expect(auth.setViewAs).toHaveBeenCalledWith({
      as: 'head',
      departmentId: 'd1',
      departmentName: 'Media',
    })
  })

  it('is not there for anybody who cannot preview', async () => {
    auth.canPreview = false
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.queryByText('View as')).not.toBeInTheDocument()
  })

  it('says a preview is on, what it does not cover, and how to leave', async () => {
    auth.viewAs = { as: 'member', departmentId: 'd1', departmentName: 'Media' }
    const user = show()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Previewing as a Team Member of Media',
    )
    expect(screen.getByRole('status')).toHaveTextContent('still read with your Admin access')
    await user.click(screen.getByRole('button', { name: 'Exit preview' }))
    expect(auth.setViewAs).toHaveBeenCalledWith(null)
  })
})
