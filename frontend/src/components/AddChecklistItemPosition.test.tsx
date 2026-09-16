import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentRolesCard } from './DepartmentRolesCard'
import type { RoleChecklistItem } from '../lib/types'

/*
 * Where a newly added checklist line lands.
 *
 * It goes on the end. Taking the position from how many lines there are
 * only works while a list is numbered from zero with no gaps — and a list
 * numbered from one, or one with a gap left by a deleted line, puts the
 * new row on the same number as the last one. Two rows holding the same
 * number sort wherever the database feels like putting them, which is how
 * a new line arrived second from bottom.
 */

const inserts: Record<string, unknown>[] = []
const fetchDepartmentRoles = vi.fn()
const fetchRoleChecklistItems = vi.fn()

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true }) }))

vi.mock('../lib/queries', () => ({
  fetchDepartmentRoles: () => fetchDepartmentRoles(),
  fetchRoleChecklistItems: () => fetchRoleChecklistItems(),
  fetchRoleGroups: () => Promise.resolve([]),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push(row)
        return Promise.resolve({ error: null })
      },
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    rpc: () => Promise.resolve({ error: null }),
  },
}))

const item = (sort_order: number, over: Partial<RoleChecklistItem> = {}): RoleChecklistItem =>
  ({
    id: `i${sort_order}`,
    role_id: 'cam1',
    department_id: 'd1',
    label: `Step ${sort_order}`,
    phase: 'pre',
    sort_order,
    ...over,
  }) as RoleChecklistItem

const roles = [
  { id: 'cam1', name: 'Camera Operator 1', department_id: 'd1', sort_order: 0, group_id: null },
]

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DepartmentRolesCard departmentId="d1" canManage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function addLine(user: ReturnType<typeof userEvent.setup>, text: string) {
  const row = (await screen.findByText('Camera Operator 1')).closest('li')!
  await user.click(within(row).getByText('Checklist'))
  const box = within(row).getByPlaceholderText(/Check batteries/)
  await user.type(box, text)
  await user.click(within(row).getAllByRole('button', { name: 'Add' })[0])
}

beforeEach(() => {
  inserts.length = 0
  fetchDepartmentRoles.mockResolvedValue(roles)
})

describe('where a new checklist line lands', () => {
  // The case the media team's lists are in: numbered from one.
  it('goes after the last one when the list is numbered from one', async () => {
    fetchRoleChecklistItems.mockResolvedValue([item(1), item(2), item(3)])
    const user = show()
    await addLine(user, 'Set the exposure')

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toMatchObject({ label: 'Set the exposure', sort_order: 4 })
  })

  it('goes after the last one when the list is numbered from zero', async () => {
    fetchRoleChecklistItems.mockResolvedValue([item(0), item(1), item(2)])
    const user = show()
    await addLine(user, 'Set the exposure')

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toMatchObject({ sort_order: 3 })
  })

  // Deleting from the middle leaves a gap, and the count stops matching
  // the last number even on a list that started at zero.
  it('goes after the last one when a deleted line left a gap', async () => {
    fetchRoleChecklistItems.mockResolvedValue([item(0), item(3), item(7)])
    const user = show()
    await addLine(user, 'Set the exposure')

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toMatchObject({ sort_order: 8 })
  })

  it('starts at zero on an empty list', async () => {
    fetchRoleChecklistItems.mockResolvedValue([])
    const user = show()
    await addLine(user, 'Set the exposure')

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toMatchObject({ sort_order: 0 })
  })

  /*
   * The two phases are numbered independently, so what is already in the
   * after-service list must not push the before-service one along.
   */
  it('counts only the lines in its own half of the list', async () => {
    fetchRoleChecklistItems.mockResolvedValue([
      item(1),
      item(2),
      item(9, { id: 'p9', phase: 'post', label: 'Pack the tripod' }),
    ])
    const user = show()
    await addLine(user, 'Set the exposure')

    await waitFor(() => expect(inserts).toHaveLength(1))
    expect(inserts[0]).toMatchObject({ phase: 'pre', sort_order: 3 })
  })
})
