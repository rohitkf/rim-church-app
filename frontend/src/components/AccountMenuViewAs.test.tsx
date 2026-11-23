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
  isSuperAdmin: false,
  viewAs: null as null | Record<string, string>,
  setViewAs: vi.fn(),
}))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
// Take the tour reads who you are from elsewhere; this is about Preview as.
vi.mock('../lib/useStartTour', () => ({ useStartTour: () => () => undefined }))
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

/** The menu, with "Preview as" unfolded to its names: it starts as one line. */
async function unfold(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Account' }))
  await user.click(screen.getByRole('menuitem', { name: 'Preview as' }))
}

beforeEach(() => {
  auth.canPreview = true
  auth.isSuperAdmin = false
  auth.viewAs = null
  auth.setViewAs.mockClear()
})

describe('Preview as, in the account menu', () => {
  it('is one line until it is pressed, and then shows the names', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    const line = screen.getByRole('menuitem', { name: 'Preview as' })
    expect(line).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menuitem', { name: 'Church Member' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Pastor' })).not.toBeInTheDocument()
    await user.click(line)
    expect(line).toHaveAttribute('aria-expanded', 'true')
    const names = screen.getByRole('group', { name: 'Preview as' })
    expect([...names.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual([
      'Church Member',
      'Team Member…',
      'Team Coordinator…',
      'Assisting Head…',
      'Team Head…',
      'Overwatch',
      'Pastor',
    ])
    // And folds away again.
    await user.click(line)
    expect(screen.queryByRole('group', { name: 'Preview as' })).not.toBeInTheDocument()
  })

  it('sits just above the tour', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items.indexOf('Preview as')).toBe(items.indexOf('Take the tour') - 1)
  })

  it('starts unfolded while a preview is on, so the way out is in sight', async () => {
    auth.viewAs = { as: 'pastor' }
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    const names = screen.getByRole('group', { name: 'Preview as' })
    expect(names).toHaveTextContent('Previewing as')
    await user.click(screen.getAllByRole('menuitem', { name: 'Exit preview' })[0])
    expect(auth.setViewAs).toHaveBeenCalledWith(null)
  })

  it('offers an Admin a Church Member preview', async () => {
    const user = show()
    await unfold(user)
    await user.click(screen.getByRole('menuitem', { name: 'Church Member' }))
    expect(auth.setViewAs).toHaveBeenCalledWith({ as: 'church' })
  })

  it('asks which team before previewing a Head', async () => {
    const user = show()
    await unfold(user)
    await user.click(screen.getByRole('menuitem', { name: 'Team Head…' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Media' }))
    expect(auth.setViewAs).toHaveBeenCalledWith({
      as: 'head',
      departmentId: 'd1',
      departmentName: 'Media',
    })
  })

  it('offers an Admin an Overwatch preview, with no team to pick', async () => {
    const user = show()
    await unfold(user)
    await user.click(screen.getByRole('menuitem', { name: 'Overwatch' }))
    expect(auth.setViewAs).toHaveBeenCalledWith({ as: 'overwatch' })
  })

  it('asks which team before previewing an Assisting Head or a Team Coordinator', async () => {
    const user = show()
    await unfold(user)
    await user.click(screen.getByRole('menuitem', { name: 'Assisting Head…' }))
    expect(screen.getByText('Assisting Head of which team?')).toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: 'Media' }))
    expect(auth.setViewAs).toHaveBeenLastCalledWith({ as: 'assistant', departmentId: 'd1', departmentName: 'Media' })

    await unfold(user)
    await user.click(screen.getByRole('menuitem', { name: 'Team Coordinator…' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Media' }))
    expect(auth.setViewAs).toHaveBeenLastCalledWith({ as: 'coordinator', departmentId: 'd1', departmentName: 'Media' })
  })

  it('offers an Admin preview to the owner only', async () => {
    let user = show()
    await unfold(user)
    expect(screen.queryByRole('menuitem', { name: 'Admin' })).not.toBeInTheDocument()
    document.body.innerHTML = ''

    auth.isSuperAdmin = true
    user = show()
    await unfold(user)
    await user.click(screen.getByRole('menuitem', { name: 'Admin' }))
    expect(auth.setViewAs).toHaveBeenCalledWith({ as: 'admin' })
  })

  it('says it is previewing Overwatch', () => {
    auth.viewAs = { as: 'overwatch' }
    show()
    expect(screen.getByRole('status')).toHaveTextContent('Previewing as Overwatch.')
  })

  it('is not there for anybody who cannot preview', async () => {
    auth.canPreview = false
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.queryByRole('menuitem', { name: 'Preview as' })).not.toBeInTheDocument()
  })

  it('says a preview is on, what it does not cover, and how to leave', async () => {
    auth.viewAs = { as: 'member', departmentId: 'd1', departmentName: 'Media' }
    const user = show()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Previewing as a Team Member of Media',
    )
    expect(screen.getByRole('status')).toHaveTextContent('still read with your own access')
    expect(screen.getByRole('status')).toHaveTextContent('Anything you save is saved for real')
    await user.click(screen.getByRole('button', { name: 'Exit preview' }))
    expect(auth.setViewAs).toHaveBeenCalledWith(null)
  })
})
