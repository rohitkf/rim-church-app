import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PollsPage, audienceLabel } from './PollsPage'

const auth = {
  session: { user: { id: 'me' } },
  isAdmin: false,
  ledDepartmentIds: [] as string[],
}
vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))

vi.mock('../lib/queries', () => ({
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd1', name: 'Media', color: '#ff0000' },
      { id: 'd2', name: 'Worship', color: '#00ff00' },
    ]),
}))

const state = vi.hoisted(() => ({
  polls: [] as Record<string, unknown>[],
  inserts: [] as { table: string; row: unknown }[],
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      const rows =
        table === 'team_polls'
          ? state.polls
          : table === 'services'
            ? [{ id: 's1', date: '2026-10-04', service_type: 'English Service' }]
            : table === 'profiles'
              ? [{ id: 'p1', first_name: 'Grace', last_name: 'Mensah' }]
              : []
      builder.select = () => builder
      builder.order = () => builder
      builder.gte = () => builder
      builder.limit = () => builder
      builder.eq = () => builder
      builder.delete = () => builder
      builder.insert = (row: unknown) => {
        state.inserts.push({ table, row })
        return builder
      }
      builder.single = () => Promise.resolve({ data: { id: 'new-poll' }, error: null })
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
      return builder
    },
  },
}))

const poll = (over: Record<string, unknown>) => ({
  id: 'q1',
  audience: 'everyone',
  department_id: null,
  service_id: null,
  recipient_ids: [],
  created_by: 'someone',
  question: 'Which Sunday suits the picnic?',
  choice_mode: 'single',
  closes_at: null,
  created_at: new Date().toISOString(),
  department: null,
  service: null,
  options: [
    { id: 'o1', label: '4 October', sort_order: 0 },
    { id: 'o2', label: '11 October', sort_order: 1 },
  ],
  votes: [{ option_id: 'o1', user_id: 'x' }],
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PollsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  auth.isAdmin = false
  auth.ledDepartmentIds = []
  state.polls = []
  state.inserts = []
})

describe('who a poll says it is for', () => {
  it('names each audience', () => {
    const base = { department: null, service: null, recipient_ids: [] as string[] }
    expect(audienceLabel({ ...base, audience: 'everyone' })).toBe('Everyone')
    expect(audienceLabel({ ...base, audience: 'team', department: { name: 'Media' } })).toBe('Media')
    expect(audienceLabel({ ...base, audience: 'people', recipient_ids: ['a', 'b'] })).toBe('2 people')
    expect(
      audienceLabel({
        ...base,
        audience: 'service',
        service: { date: '2026-10-04', service_type: 'English Service' },
      }),
    ).toMatch(/^Serving at English Service · /)
    expect(
      audienceLabel({
        ...base,
        audience: 'service',
        department: { name: 'Media' },
        service: { date: '2026-10-04', service_type: 'English Service' },
      }),
    ).toMatch(/^Media at English Service/)
  })
})

describe('the Polls page', () => {
  it('shows a member the polls put to them, to answer but not to ask or delete', async () => {
    state.polls = [poll({})]
    show()
    expect(await screen.findByText('Which Sunday suits the picnic?')).toBeInTheDocument()
    expect(screen.getByText('Everyone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /4 October/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'New poll' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete poll/ })).not.toBeInTheDocument()
  })

  it('lets a Head ask only their own team, whole or at a service', async () => {
    auth.ledDepartmentIds = ['d1']
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    expect(screen.queryByRole('button', { name: 'Everyone' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'People' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A team' })).toHaveAttribute('aria-pressed', 'true')

    await user.type(screen.getByLabelText('Question'), 'Rehearsal night?')
    await user.type(screen.getByLabelText('Option 1'), 'Tuesday')
    await user.type(screen.getByLabelText('Option 2'), 'Thursday')
    await user.click(screen.getByRole('button', { name: 'Post poll' }))

    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({
      audience: 'team',
      department_id: 'd1',
      service_id: null,
      recipient_ids: [],
      question: 'Rehearsal night?',
    })
  })

  it('lets an Admin ask everyone', async () => {
    auth.isAdmin = true
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByLabelText('Question'), 'Picnic?')
    await user.type(screen.getByLabelText('Option 1'), 'Yes')
    await user.type(screen.getByLabelText('Option 2'), 'No')
    await user.click(screen.getByRole('button', { name: 'Post poll' }))
    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({ audience: 'everyone', department_id: null })
  })

  it('will not post a people poll with nobody picked', async () => {
    auth.isAdmin = true
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'New poll' }))
    await user.click(screen.getByRole('button', { name: 'People' }))
    await user.type(screen.getByLabelText('Question'), 'Can you drive?')
    await user.type(screen.getByLabelText('Option 1'), 'Yes')
    await user.type(screen.getByLabelText('Option 2'), 'No')
    expect(screen.getByRole('button', { name: 'Post poll' })).toBeDisabled()
    await user.click(await screen.findByLabelText('Grace Mensah'))
    expect(screen.getByRole('button', { name: 'Post poll' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Post poll' }))
    await waitFor(() => expect(state.inserts).toHaveLength(2))
    expect(state.inserts[0].row).toMatchObject({ audience: 'people', recipient_ids: ['p1'] })
  })
})
