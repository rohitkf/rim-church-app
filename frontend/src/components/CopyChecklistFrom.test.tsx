import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentRolesCard } from './DepartmentRolesCard'
import type { RoleChecklistItem } from '../lib/types'

const insert = vi.fn()
const fetchDepartmentRoles = vi.fn()
const fetchRoleChecklistItems = vi.fn()

// Reached through useErrorText: an Admin sees the database's own wording,
// which is what the failure cases below assert on.
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

vi.mock('../lib/queries', () => ({
  fetchDepartmentRoles: () => fetchDepartmentRoles(),
  fetchRoleChecklistItems: () => fetchRoleChecklistItems(),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: (rows: unknown) => insert(rows),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    rpc: () => Promise.resolve({ error: null }),
  },
}))

let n = 0
const item = (over: Partial<RoleChecklistItem> = {}): RoleChecklistItem =>
  ({
    id: `i${(n += 1)}`,
    role_id: 'cam1',
    department_id: 'd1',
    label: 'Check batteries',
    phase: 'pre',
    sort_order: 0,
    ...over,
  }) as RoleChecklistItem

const roles = [
  { id: 'cam1', name: 'Camera Operator 1', department_id: 'd1', sort_order: 0 },
  { id: 'cam2', name: 'Camera Operator 2', department_id: 'd1', sort_order: 1 },
]

function show(canManage = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DepartmentRolesCard departmentId="d1" canManage={canManage} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** Open the Checklist disclosure on the named role. */
async function openChecklistOn(user: ReturnType<typeof userEvent.setup>, roleName: string) {
  const row = (await screen.findByText(roleName)).closest('li')!
  await user.click(within(row).getByText('Checklist'))
  return row
}

describe('copying a checklist from another role', () => {
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null })
    fetchDepartmentRoles.mockReset().mockResolvedValue(roles)
    fetchRoleChecklistItems.mockReset().mockResolvedValue([
      item({ role_id: 'cam1', label: 'Check batteries', phase: 'pre', sort_order: 0 }),
      item({ role_id: 'cam1', label: 'Test focus', phase: 'pre', sort_order: 1 }),
      item({ role_id: 'cam1', label: 'Batteries on charge', phase: 'post', sort_order: 0 }),
    ])
  })

  it('offers the role that has a checklist, with how much it carries', async () => {
    const user = show()
    const row = await openChecklistOn(user, 'Camera Operator 2')
    const picker = within(row).getByRole('combobox')
    expect(within(picker).getByRole('option', { name: 'Camera Operator 1 (3)' })).toBeInTheDocument()
  })

  it('does not offer the role itself', async () => {
    const user = show()
    const row = await openChecklistOn(user, 'Camera Operator 1')
    // Camera Operator 2 has nothing to give, and a role cannot copy itself,
    // so there is nothing to offer and the control stays away entirely.
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('writes the whole list — both halves — against the receiving role', async () => {
    const user = show()
    const row = await openChecklistOn(user, 'Camera Operator 2')
    await user.selectOptions(within(row).getByRole('combobox'), 'cam1')

    await waitFor(() => expect(insert).toHaveBeenCalled())
    expect(insert.mock.calls[0][0]).toEqual([
      { label: 'Check batteries', phase: 'pre', sort_order: 0, role_id: 'cam2', department_id: 'd1' },
      { label: 'Test focus', phase: 'pre', sort_order: 1, role_id: 'cam2', department_id: 'd1' },
      { label: 'Batteries on charge', phase: 'post', sort_order: 0, role_id: 'cam2', department_id: 'd1' },
    ])
    expect(await screen.findByText(/Copied 3 items from Camera Operator 1/)).toBeInTheDocument()
  })

  it('says so plainly when there is nothing new to take', async () => {
    // Copying twice is the ordinary way to reach this, and a silent no-op
    // reads as a broken button.
    fetchRoleChecklistItems.mockResolvedValue([
      item({ role_id: 'cam1', label: 'Check batteries' }),
      item({ role_id: 'cam2', label: 'check batteries ' }),
    ])
    const user = show()
    const row = await openChecklistOn(user, 'Camera Operator 2')
    await user.selectOptions(within(row).getByRole('combobox'), 'cam1')

    expect(await screen.findByText(/Nothing new to take/)).toBeInTheDocument()
    expect(insert).not.toHaveBeenCalled()
  })

  it('is not offered to somebody who cannot manage the team', async () => {
    const user = show(false)
    const row = (await screen.findByText('Camera Operator 2')).closest('li')!
    await user.click(within(row).getByText('Checklist'))
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument()
  })
})
