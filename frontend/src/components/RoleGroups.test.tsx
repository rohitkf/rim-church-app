import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentRolesCard } from './DepartmentRolesCard'
import { chooseOption } from '../test/select'
import { UNGROUPED_LABEL } from '../lib/roleGroups'

const update = vi.fn()
const eq = vi.fn()
const fetchDepartmentRoles = vi.fn()
const fetchRoleGroups = vi.fn()

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

vi.mock('../lib/queries', () => ({
  fetchDepartmentRoles: () => fetchDepartmentRoles(),
  fetchRoleChecklistItems: () => Promise.resolve([]),
  fetchRoleGroups: () => fetchRoleGroups(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: (col: string, id: string) => eq(table, 'delete', col, id) }),
      update: (patch: unknown) => ({
        eq: (_col: string, id: string) => {
          update(table, patch, id)
          return Promise.resolve({ error: null })
        },
      }),
    }),
    rpc: () => Promise.resolve({ error: null }),
  },
}))

const role = (id: string, name: string, sort_order: number, group_id: string | null = null) => ({
  id,
  name,
  department_id: 'd1',
  sort_order,
  group_id,
})

function show(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DepartmentRolesCard departmentId="d1" canManage={canManage} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('roles grouped on the Teams page', () => {
  beforeEach(() => {
    update.mockReset()
    eq.mockReset().mockResolvedValue({ error: null })
    fetchDepartmentRoles.mockReset().mockResolvedValue([
      role('c', 'Team Coordinator', 0),
      role('wl1', 'Worship Leader 1', 1, 'g1'),
      role('k1', 'Keys 1', 2, 'g2'),
      role('spare', 'Sound check', 3),
    ])
    fetchRoleGroups.mockReset().mockResolvedValue([
      { id: 'g1', department_id: 'd1', name: 'Worship Leaders', sort_order: 1 },
      { id: 'g2', department_id: 'd1', name: 'Band', sort_order: 2 },
    ])
  })

  it('draws every group, with the unfiled roles last', async () => {
    show()
    await screen.findByRole('heading', { name: /Worship Leaders/ })
    const headings = screen.getAllByRole('heading', { level: 3 })
    expect(headings.map((h) => h.textContent?.replace(/\d+$/, '').trim())).toEqual([
      'Worship Leaders',
      'Band',
      'Everything else',
    ])
  })

  it('pins the Team Coordinator above the groups, and marks it built in', async () => {
    show()
    const pinned = (await screen.findByText('Team Coordinator')).closest('div')!
    expect(within(pinned).getByText('Built in')).toBeInTheDocument()
    // Not inside any group's list.
    expect(pinned.closest('li')).toBeNull()
  })

  it('offers no Edit or Delete on the Team Coordinator', async () => {
    show()
    const pinned = (await screen.findByText('Team Coordinator')).closest('div')!
    expect(within(pinned).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(pinned).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('moves a role to another group from its dropdown', async () => {
    const user = show()
    await screen.findByText('Keys 1')
    await chooseOption(user, screen.getByLabelText('Group for Keys 1'), 'Worship Leaders')
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('department_roles', { group_id: 'g1' }, 'k1'),
    )
  })

  it('takes a role out of every group by choosing the unfiled option', async () => {
    const user = show()
    await screen.findByText('Keys 1')
    await chooseOption(user, screen.getByLabelText('Group for Keys 1'), UNGROUPED_LABEL)
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('department_roles', { group_id: null }, 'k1'),
    )
  })

  it('deletes a group without taking its roles with it', async () => {
    // The column is `on delete set null`, so the roles fall back to the
    // unfiled list. Deleting a heading must never cost a team its
    // checklists and rota history.
    const user = show()
    await screen.findByRole('heading', { name: /Band/ })
    const heading = screen.getByRole('heading', { name: /Band/ }).closest('div')!
    await user.click(within(heading).getByRole('button', { name: 'Delete group' }))
    await waitFor(() =>
      expect(eq).toHaveBeenCalledWith('department_role_groups', 'delete', 'id', 'g2'),
    )
    expect(eq).not.toHaveBeenCalledWith('department_roles', 'delete', expect.anything(), 'k1')
  })

  it('shows no heading at all for a team that has made no groups', async () => {
    // A small team has done nothing wrong, and "Everything else" over the
    // only list on the page labels a distinction that does not exist.
    fetchRoleGroups.mockResolvedValue([])
    show()
    await screen.findByText('Sound check')
    expect(screen.queryByRole('heading', { name: /Everything else/ })).not.toBeInTheDocument()
  })

  it('gives somebody who cannot manage the team no controls at all', async () => {
    show(false)
    await screen.findByText('Keys 1')
    expect(screen.queryByLabelText('Group for Keys 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete group' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Worship Leaders, Backing Vocals/)).not.toBeInTheDocument()
  })
})
