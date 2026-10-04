import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DepartmentDetailPage } from './DepartmentDetailPage'

/*
 * Moving somebody between core and guest.
 *
 * People move both ways over a year — a guest who keeps turning up becomes
 * part of the team, a core member steps back to helping when they can — and
 * the only way to record it was to remove them and add them again, which
 * loses the date they joined and reads on the feed like they left.
 *
 * It is not cosmetic. Availability is counted against the core, so a core
 * member who can rarely serve makes the team look a person down every week.
 */

const state = vi.hoisted(() => ({
  members: [] as Record<string, unknown>[],
  written: [] as { table: string; op: string; row: unknown; id?: string }[],
  canManage: true,
  owner: false,
  selects: [] as string[],
  rpcs: [] as { fn: string; args: unknown }[],
  sensitiveAsked: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: state.canManage || state.owner,
    isSuperAdmin: state.owner,
    isDepartmentHead: () => state.canManage,
  }),
}))

vi.mock('../components/DepartmentRolesCard', () => ({ DepartmentRolesCard: () => null }))
vi.mock('../components/HandbookUploadModal', () => ({ HandbookUploadModal: () => null }))
vi.mock('../components/InviteDialog', () => ({ InviteDialog: () => null }))
vi.mock('../lib/useHandbookUrl', () => ({
  HANDBOOK_BUCKET: 'handbooks',
  useHandbookUrl: () => ({ data: null }),
}))
vi.mock('../lib/queries', () => ({ searchProfiles: () => Promise.resolve([]) }))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      state.rpcs.push({ fn, args })
      if (fn === 'people_contacts') return Promise.resolve({ data: [{ id: 'p1', email: 'grace@rehoboth.org', phone: null }], error: null })
      if (fn === 'person_by_email') return Promise.resolve({ data: 'p9', error: null })
      return Promise.resolve({ data: null, error: null })
    },
    from: (table: string) => ({
      select: (columns?: string) => {
        if (table === 'department_members') state.selects.push(columns ?? '')
        if (table === 'profile_sensitive') state.sensitiveAsked += 1
        const rows =
          table === 'department_members'
            ? state.members
            : table === 'departments'
              ? [{ id: 'd1', name: 'Media', handbook_url: null, color: null, is_service_flow: false, is_worship: false, created_at: 'x', updated_at: 'x' }]
              : []
        const answer = Promise.resolve({ data: rows, error: null })
        return Object.assign(answer, {
          eq: () =>
            Object.assign(Promise.resolve({ data: rows, error: null }), {
              maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
            }),
          in: () => Promise.resolve({ data: [], error: null }),
        })
      },
      insert: (row: unknown) => {
        state.written.push({ table, op: 'insert', row })
        return Promise.resolve({ error: null })
      },
      update: (row: unknown) => ({
        eq: (_column: string, id: string) => {
          state.written.push({ table, op: 'update', row, id })
          return Promise.resolve({ error: null })
        },
      }),
      delete: () => ({
        eq: (_column: string, id: string) => {
          state.written.push({ table, op: 'delete', row: null, id })
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

const member = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  department_id: 'd1',
  user_id: 'p1',
  member_type: 'core',
  created_at: '2026-01-01T00:00:00Z',
  profiles: {
    id: 'p1',
    first_name: 'Grace',
    last_name: 'Mensah',
    phone: null,
    avatar_url: null,
    dob: null,
  },
  ...over,
})

beforeEach(() => {
  state.members = [member()]
  state.written = []
  state.canManage = true
  state.owner = false
  state.selects = []
  state.rpcs = []
  state.sensitiveAsked = 0
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/departments/d1']}>
        <Routes>
          <Route path="/departments/:id" element={<DepartmentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Confirm whatever the page just asked about. */
async function confirm(label: RegExp) {
  const dialog = await screen.findByRole('alertdialog')
  await userEvent.click(within(dialog).getByRole('button', { name: label }))
}

describe('moving somebody between core and guest', () => {
  it('offers to make a core member a guest', async () => {
    show()
    const buttons = await screen.findAllByRole('button', { name: 'Make a guest' })
    await userEvent.click(buttons[0])
    await confirm(/Make a guest/)

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0]).toMatchObject({
      table: 'department_members',
      op: 'update',
      id: 'm1',
    })
    expect(state.written[0].row).toEqual({ member_type: 'guest' })
  })

  it('offers the other direction to a guest', async () => {
    state.members = [member({ member_type: 'guest' })]
    show()
    const buttons = await screen.findAllByRole('button', { name: 'Make core' })
    await userEvent.click(buttons[0])
    await confirm(/Make core/)

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written[0].row).toEqual({ member_type: 'core' })
  })

  // The membership row is kept, so the date they joined survives the move.
  it('changes the membership rather than removing and re-adding it', async () => {
    show()
    const buttons = await screen.findAllByRole('button', { name: 'Make a guest' })
    await userEvent.click(buttons[0])
    await confirm(/Make a guest/)

    await waitFor(() => expect(state.written).toHaveLength(1))
    expect(state.written.some((w) => w.op === 'delete')).toBe(false)
  })

  it('says what the move means before it happens', async () => {
    show()
    const buttons = await screen.findAllByRole('button', { name: 'Make a guest' })
    await userEvent.click(buttons[0])

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/not counted when the team looks short/i)
  })

  it('is not offered to somebody who does not run the team', async () => {
    state.canManage = false
    show()
    // The roster is drawn twice — cards on a phone, a table from `sm` up —
    // so the name is on the page more than once either way.
    await screen.findAllByText('Grace Mensah')
    expect(screen.queryByRole('button', { name: 'Make a guest' })).toBeNull()
  })
})

describe('members’ email addresses', () => {
  it('are shown to the Owner, in the cards and the table', async () => {
    state.owner = true
    show()
    expect((await screen.findAllByText('grace@rehoboth.org')).length).toBeGreaterThan(0)
    expect(screen.getByRole('columnheader', { name: 'Contact' })).toBeInTheDocument()
    // Even for the Owner the roster never selects the closed column: the
    // address comes from the Owner-only function instead.
    expect(state.selects.every((c) => !/\bemail\b/.test(c))).toBe(true)
    expect(state.rpcs).toContainEqual({ fn: 'people_contacts', args: { p_ids: ['p1'] } })
  })

  it('show visa and DBS to the Owner only', async () => {
    state.owner = true
    show()
    await screen.findAllByText('grace@rehoboth.org')
    expect(screen.getByRole('columnheader', { name: 'Compliance' })).toBeInTheDocument()
    expect(state.sensitiveAsked).toBeGreaterThan(0)
  })

  it('are neither shown nor even asked for when an Admin or a Head is looking', async () => {
    state.canManage = true
    show()
    await screen.findAllByText('Grace Mensah')
    expect(screen.queryByText('grace@rehoboth.org')).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Contact' })).toBeNull()
    expect(state.selects.length).toBeGreaterThan(0)
    expect(state.selects.every((c) => !/\bemail\b/.test(c))).toBe(true)
    expect(state.rpcs.map((r) => r.fn)).not.toContain('people_contacts')
    // Nor are their visa and DBS records asked for, or a column drawn.
    expect(state.sensitiveAsked).toBe(0)
    expect(screen.queryByRole('columnheader', { name: 'Compliance' })).toBeNull()
  })

  it('are not shown to a member of the team either', async () => {
    state.canManage = false
    show()
    await screen.findAllByText('Grace Mensah')
    expect(screen.queryByText('grace@rehoboth.org')).toBeNull()
  })
})

describe('adding somebody by their full email', () => {
  it('asks the database who it belongs to, rather than reading addresses', async () => {
    show()
    const user = userEvent.setup()
    await screen.findAllByText('Grace Mensah')
    await user.type(screen.getByRole('textbox', { name: /Add by name, or their full email/ }), 'sam@rehoboth.org')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() =>
      expect(state.written).toContainEqual({
        table: 'department_members',
        op: 'insert',
        row: { department_id: 'd1', user_id: 'p9', member_type: 'core' },
      }),
    )
    expect(state.rpcs).toContainEqual({ fn: 'person_by_email', args: { p_email: 'sam@rehoboth.org' } })
  })
})
