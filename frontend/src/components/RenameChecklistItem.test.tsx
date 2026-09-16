import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DepartmentRolesCard } from './DepartmentRolesCard'
import type { RoleChecklistItem } from '../lib/types'

/*
 * Rewording a checklist line that is already there.
 *
 * A checklist gets written once and corrected for years — a step turns
 * out to mean something more specific, or the kit it names gets replaced.
 * Before this the only way to fix a word was to delete the line and type
 * it again, which throws away the item's id and every tick recorded
 * against it on past services.
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

describe('rewording a checklist line', () => {
  it('writes the new wording to the line that was already there', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Edit: Check batteries' }))
    const box = screen.getByLabelText('Reword: Check batteries')
    await user.clear(box)
    await user.type(box, 'Charge the camera and TX batteries')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toMatchObject({ id: 'i1' })
    expect(updates[0].row).toMatchObject({ label: 'Charge the camera and TX batteries' })
  })

  /*
   * The whole point of rewording rather than retyping: the id survives,
   * so the ticks recorded against it on past services survive with it.
   */
  it('changes the line rather than replacing it', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Edit: Check batteries' }))
    await user.type(screen.getByLabelText('Reword: Check batteries'), ' again')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(deletes).toHaveLength(0)
  })

  it('saves on Enter', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Edit: Check batteries' }))
    await user.type(screen.getByLabelText('Reword: Check batteries'), ' twice{Enter}')

    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0].row).toMatchObject({ label: 'Check batteries twice' })
  })

  it('leaves the line alone on Cancel', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Edit: Check batteries' }))
    await user.type(screen.getByLabelText('Reword: Check batteries'), ' and cables')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(updates).toHaveLength(0)
    expect(screen.getByText('Check batteries')).toBeInTheDocument()
  })

  it('leaves the line alone on Escape', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Edit: Check batteries' }))
    await user.type(screen.getByLabelText('Reword: Check batteries'), ' and cables{Escape}')

    expect(updates).toHaveLength(0)
    expect(screen.getByText('Check batteries')).toBeInTheDocument()
  })

  // An empty checklist line is not a line, and saving the same words is
  // not a change — neither is worth a write.
  it('writes nothing when the words did not change', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Edit: Check batteries' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(updates).toHaveLength(0)
  })

  it('will not save an emptied line', async () => {
    const user = show()
    const row = await openChecklist(user)

    await user.click(within(row).getByRole('button', { name: 'Edit: Check batteries' }))
    await user.clear(screen.getByLabelText('Reword: Check batteries'))

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  // Reading the roles is not managing them.
  it('offers nothing to edit to somebody who cannot manage the team', async () => {
    const user = show(false)
    const row = (await screen.findByText('Camera Operator 1')).closest('li')!
    await user.click(within(row).getByText('Checklist'))

    expect(await within(row).findByText('Check batteries')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /^Edit: / })).toBeNull()
  })
})
