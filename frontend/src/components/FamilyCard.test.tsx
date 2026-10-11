import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamilyCard, FamilyRequests } from './FamilyCard'

/*
 * Who you live with (0149): the database does the linking and decides who
 * sees what, so what matters here is that the card shows a family the way
 * it came back, and asks the database for the right thing.
 */

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } }, isAdmin: false }),
}))

vi.mock('../lib/supabaseClient', () => {
  // Every filter returns the same query; awaiting it gives the table's rows.
  const query = (table: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'order', 'limit', 'or', 'ilike', 'neq', 'eq', 'in']) q[m] = () => q
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: state.rows[table] ?? [], error: null }).then(ok)
    return q
  }
  return {
    supabase: {
      from: (table: string) => query(table),
      rpc: (fn: string, args: Record<string, unknown>) => {
        state.rpc.push({ fn, args })
        return Promise.resolve({ data: null, error: null })
      },
    },
  }
})

const member = (over: Record<string, unknown>) => ({
  household_id: 'h1',
  kind: 'child',
  user_id: null,
  first_name: null,
  last_name: null,
  dob: null,
  gender: null,
  school: null,
  year_group: null,
  person: null,
  ...over,
})

function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  state.rpc = []
  state.rows = {
    households: [{ id: 'h1', address_line1: '1 High St', address_line2: null, town: 'Leeds', postcode: 'LS1 1AA' }],
    household_members: [
      member({ id: 'me', kind: 'adult', user_id: 'u1', person: { id: 'u1', first_name: 'Rohit', last_name: 'K', dob: null } }),
      member({ id: 'sp', kind: 'adult', user_id: 'u2', person: { id: 'u2', first_name: 'Grace', last_name: 'Mensah', dob: '1990-04-02' } }),
      member({ id: 'k1', first_name: 'Ann', last_name: 'Mensah', dob: '2015-03-12', gender: 'female', year_group: 'Year 6' }),
    ],
    family_link_requests: [],
    profiles: [{ id: 'u9', first_name: 'Joel', last_name: 'Skaria', avatar_url: null }],
  }
})

describe('the family card', () => {
  it('shows the household as it is: the address, a linked spouse, and a child added by hand', async () => {
    show(<FamilyCard />)
    expect(await screen.findByText('Grace Mensah')).toBeInTheDocument()
    const spouse = screen.getByRole('region', { name: 'Spouse' })
    expect(within(spouse).getByText('Linked')).toBeInTheDocument()
    const kids = screen.getByRole('region', { name: 'Children' })
    expect(within(kids).getByText('Ann Mensah')).toBeInTheDocument()
    expect(within(kids).getByText(/Girl · Year 6/)).toBeInTheDocument()
    expect(within(kids).getByText('Added by hand')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1 High St')).toBeInTheDocument()
  })

  it('suggests an account as a name is typed, and asks them rather than linking', async () => {
    const user = userEvent.setup()
    show(<FamilyCard />)
    await screen.findByText('Ann Mensah')
    await user.click(screen.getByRole('button', { name: /Add another child/ }))
    await user.type(screen.getByRole('textbox', { name: /Add another child/ }), 'Jo')
    await user.click(await screen.findByRole('button', { name: /Joel Skaria/ }))
    expect(screen.getByText(/nothing is linked until they do/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({
      fn: 'request_family_link',
      args: { p_to: 'u9', p_relation: 'child', p_replaces: null },
    })
  })

  it('writes somebody in by hand when they are not on the app', async () => {
    const user = userEvent.setup()
    state.rows.profiles = []
    show(<FamilyCard />)
    await screen.findByText('Ann Mensah')
    await user.click(screen.getByRole('button', { name: /Add another child/ }))
    await user.type(screen.getByRole('textbox', { name: /Add another child/ }), 'Sam Mensah')
    await user.click(screen.getByRole('button', { name: /Add “Sam Mensah” by hand/ }))
    expect(screen.getByDisplayValue('Sam')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0].fn).toBe('save_household_person')
    expect(state.rpc[0].args).toMatchObject({ p_id: null, p_where: 'home', p_kind: 'child', p_first: 'Sam', p_last: 'Mensah' })
  })

  it('asks whether there are children before offering to add one', async () => {
    const user = userEvent.setup()
    state.rows.household_members = []
    state.rows.households = []
    show(<FamilyCard />)
    const kids = await screen.findByRole('region', { name: 'Children' })
    expect(within(kids).queryByRole('button', { name: /Add a child/ })).toBeNull()
    await user.click(within(kids).getByRole('button', { name: 'Yes' }))
    expect(within(kids).getByRole('button', { name: /Add a child/ })).toBeInTheDocument()
  })
})

describe('the children question and the address, saved as they change', () => {
  it('stores the answer to "Do you have children?", so it is not asked again', async () => {
    const user = userEvent.setup()
    state.rows.household_members = []
    state.rows.households = []
    show(<FamilyCard />)
    const kids = await screen.findByRole('region', { name: 'Children' })
    await user.click(within(kids).getByRole('button', { name: 'No' }))
    await waitFor(() => expect(state.rpc).toContainEqual({ fn: 'save_household_has_children', args: { p_has: false } }))
  })

  it('remembers a yes that was given before', async () => {
    state.rows.household_members = [
      member({ id: 'me', kind: 'adult', user_id: 'u1', person: { id: 'u1', first_name: 'Rohit', last_name: 'K', dob: null } }),
    ]
    state.rows.households = [{ id: 'h1', address_line1: null, address_line2: null, town: null, postcode: null, has_children: true }]
    show(<FamilyCard />)
    const kids = await screen.findByRole('region', { name: 'Children' })
    await waitFor(() => expect(within(kids).getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true'))
    expect(within(kids).getByRole('button', { name: /Add a child/ })).toBeInTheDocument()
  })

  it('saves the address on its own a moment after typing stops', async () => {
    const user = userEvent.setup()
    show(<FamilyCard />)
    const town = await screen.findByDisplayValue('Leeds')
    await user.clear(town)
    await user.type(town, 'York')
    await waitFor(
      () => expect(state.rpc.find((c) => c.fn === 'save_household_address')?.args).toMatchObject({ p_town: 'York', p_line1: '1 High St' }),
      { timeout: 3000 },
    )
    expect(screen.queryByRole('button', { name: 'Save address' })).toBeNull()
  })
})

describe('a family request waiting on me', () => {
  it('says who and as what, and confirms through the database', async () => {
    const user = userEvent.setup()
    state.rows.family_link_requests = [
      {
        id: 'r1',
        from_user: 'u9',
        to_user: 'u1',
        relation: 'spouse',
        replaces_member: null,
        created_at: '2026-10-11T10:00:00Z',
        from: { first_name: 'Joel', last_name: 'Skaria' },
        to: { first_name: 'Rohit', last_name: 'K' },
      },
    ]
    show(<FamilyRequests />)
    expect(await screen.findByText(/says you are their spouse/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(state.rpc).toHaveLength(1))
    expect(state.rpc[0]).toEqual({ fn: 'answer_family_link', args: { p_request: 'r1', p_accept: true } })
  })

  it('shows nothing when nobody is waiting', async () => {
    show(<FamilyRequests />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('Family requests')).toBeNull()
  })
})
