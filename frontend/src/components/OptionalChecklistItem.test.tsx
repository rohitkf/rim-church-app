import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentRolesCard } from './DepartmentRolesCard'
import type { RoleChecklistItem } from '../lib/types'

/*
 * Making a checklist line optional (0259): it stays on the role's list but
 * counts towards readiness only once the person holding the role ticks it.
 * Same setup as RenameChecklistItem.test.tsx.
 */

const updates: { row: unknown; id: string }[] = []
const deletes: string[] = []
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
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({
        eq: (_c: string, id: string) => {
          deletes.push(id)
          return Promise.resolve({ error: null })
        },
      }),
      update: (row: unknown) => ({
        eq: (_c: string, id: string) => {
          updates.push({ row, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
    rpc: () => Promise.resolve({ error: null }),
  },
}))

const item = (over: Partial<RoleChecklistItem> = {}): RoleChecklistItem =>
  ({
    id: 'i1',
    role_id: 'cam1',
    department_id: 'd1',
    label: 'Check batteries',
    phase: 'pre',
    sort_order: 0,
    ...over,
  }) as RoleChecklistItem

const roles = [
  { id: 'cam1', name: 'Camera Operator 1', department_id: 'd1', sort_order: 0, group_id: null },
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

async function openChecklist(user: ReturnType<typeof userEvent.setup>) {
  const row = (await screen.findByText('Camera Operator 1')).closest('li')!
  await user.click(within(row).getByText('Checklist'))
  return row
}

beforeEach(() => {
  updates.length = 0
  deletes.length = 0
  fetchDepartmentRoles.mockResolvedValue(roles)
  fetchRoleChecklistItems.mockResolvedValue([item()])
})

describe('making a checklist line optional', () => {
  it('marks the line optional, on the line that was already there', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Make optional: Check batteries' }))

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toEqual({ id: 'i1', row: { optional: true } })
    expect(deletes).toHaveLength(0)
  })

  it('says a line is optional, and turns it back into a required one', async () => {
    fetchRoleChecklistItems.mockResolvedValue([item({ optional: true })])
    const user = show()
    const row = await openChecklist(user)

    expect(within(row).getByText('Optional')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Make required: Check batteries' }))

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toEqual({ id: 'i1', row: { optional: false } })
  })

  it('is not offered to somebody who cannot change the list', async () => {
    fetchRoleChecklistItems.mockResolvedValue([item({ optional: true })])
    const user = show(false)
    const row = await openChecklist(user)

    expect(within(row).getByText('Optional')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /Make (optional|required)/ })).toBeNull()
  })
})
