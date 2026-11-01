import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInPage } from './ClockInPage'
import { pickTime } from '../test/pickers'

/*
 * The Clock In page: who arrived, when and where; the Owner and Admins
 * can put a clock-in right, with a reason, and every change is listed.
 */

const state = vi.hoisted(() => ({
  admin: false,
  changed: [] as unknown[],
  removed: [] as unknown[],
  lookups: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: state.admin, isSuperAdmin: false }),
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ timezone: 'Europe/London', clock_in_radius_m: 100 }) }))
vi.mock('../components/ClockInPlaceCard', () => ({ ClockInPlaceCard: () => <p>Where the church is</p> }))
vi.mock('../lib/plannerControls', async (original) => ({
  ...(await original<typeof import('../lib/plannerControls')>()),
  fetchPeopleOptions: () => Promise.resolve([{ id: 'p2', first_name: 'Ama', last_name: 'Owusu' }]),
}))
vi.mock('../lib/queries', async (original) => ({
  ...(await original<typeof import('../lib/queries')>()),
  fetchDepartments: () =>
    Promise.resolve([
      { id: 'd-media', name: 'Media' },
      { id: 'd-welcome', name: 'Welcome' },
    ]),
}))
vi.mock('../lib/clockIn', async (original) => ({
  ...(await original<typeof import('../lib/clockIn')>()),
  fetchStillOut: () =>
    Promise.resolve([{ user_id: 'p2', department_id: 'd-media', call_at: '2026-11-01T09:30:00Z', asked: false }]),
  fetchClockInRequestsToAnswer: () => Promise.resolve([]),
  fetchClockInTeams: () => Promise.resolve([{ user_id: 'p1', department_id: 'd-welcome' }, { user_id: 'p3', department_id: 'd-media' }]),
  fetchClockIns: () =>
    Promise.resolve([
      {
        id: 'c1',
        user_id: 'p1',
        on_date: '2026-11-01',
        clocked_at: '2026-11-01T09:41:00Z',
        method: 'location',
        latitude: 51.5,
        longitude: -0.1,
        accuracy_m: 12,
        distance_m: 34,
        address: '12 High Street, Reading',
        address_tries: 1,
        person: { first_name: 'Joel', last_name: 'Skaria' },
      },
      {
        id: 'c2',
        user_id: 'p3',
        on_date: '2026-11-01',
        clocked_at: '2026-11-01T09:50:00Z',
        method: 'location',
        latitude: 51.5,
        longitude: -0.1,
        accuracy_m: 20,
        distance_m: 60,
        address: null,
        address_tries: 0,
        person: { first_name: 'Grace', last_name: 'Mensah' },
      },
    ]),
  fetchClockInHistory: () =>
    Promise.resolve([
      {
        id: 'h2',
        user_id: 'p1',
        on_date: '2026-11-01',
        kind: 'changed',
        clocked_at: '2026-11-01T09:41:00Z',
        previous_at: '2026-11-01T09:58:00Z',
        note: 'Phone died at the door',
        changed_by: 'me',
        changed_at: '2026-11-01T10:30:00Z',
        person: { first_name: 'Joel', last_name: 'Skaria' },
        changer: { first_name: 'Rohit', last_name: 'K' },
      },
    ]),
  changeClockInTime: (...args: unknown[]) => {
    state.changed.push(args)
    return Promise.resolve()
  },
  removeClockIn: (...args: unknown[]) => {
    state.removed.push(args)
    return Promise.resolve()
  },
  lookUpAddresses: () => {
    state.lookups += 1
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClockInPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/** The page's sections start shut; open the ones a test reads. */
async function open(user: ReturnType<typeof userEvent.setup>, ...names: RegExp[]) {
  for (const name of names) await user.click(await screen.findByRole('button', { name }))
}

beforeEach(() => {
  state.admin = false
  state.changed = []
  state.removed = []
  state.lookups = 0
})

describe('the Clock In page', () => {
  it('starts with every section shut, each saying what is in it', async () => {
    show()
    const clockIns = await screen.findByRole('button', { name: /^Clock-ins/ })
    expect(clockIns).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(clockIns).toHaveTextContent('2 clocked in · 1 still to arrive'))
    expect(screen.getByRole('button', { name: /^History/ })).toHaveTextContent('1 entry')
    expect(screen.queryByRole('list', { name: /^Who clocked in/ })).toBeNull()
  })

  it('shows who arrived, when, and where — and asks for the addresses still missing', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    const table = await screen.findByRole('list', { name: /^Who clocked in/ })
    expect(within(table).getByText('Joel Skaria')).toBeInTheDocument()
    expect(within(table).getByText('09:41')).toBeInTheDocument()
    expect(within(table).getByText('12 High Street, Reading')).toBeInTheDocument()
    expect(within(table).getByText('Looking up the address…')).toBeInTheDocument()
    expect(state.lookups).toBe(1)
  })

  it('groups them by the team they were on that day', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    await screen.findByRole('list', { name: /^Who clocked in/ })
    const media = screen.getByRole('listitem', { name: 'Media' })
    const welcome = screen.getByRole('listitem', { name: 'Welcome' })
    expect(within(media).getByText('1 in · 1 to come')).toBeInTheDocument()
    expect(within(welcome).getByText('1 in')).toBeInTheDocument()
    expect(within(media).getByText('Grace Mensah')).toBeInTheDocument()
    expect(within(welcome).getByText('Joel Skaria')).toBeInTheDocument()
  })

  it('says who on each team is still to arrive', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    const waiting = await screen.findByRole('list', { name: 'Media: still to arrive' })
    expect(waiting).toHaveTextContent('Ama Owusu 09:30')
    expect(screen.getByText(/1 in · 1 to come/)).toBeInTheDocument()
  })

  it('gives nobody but the Owner and Admins the church’s spot or a way to change anything', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    await screen.findByRole('list', { name: /^Who clocked in/ })
    expect(screen.queryByText('Where the church is')).toBeNull()
    expect(screen.queryByRole('button', { name: /Fix Joel/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a clock-in' })).toBeNull()
  })

  it('lets an Admin change a time, with a reason', async () => {
    state.admin = true
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    expect(await screen.findByText('Where the church is')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Fix Joel Skaria’s clock-in' }))
    await pickTime(user, screen.getByRole('button', { name: 'Arrived at' }), '09:30')
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'Arrived before the phone did')
    await user.click(screen.getByRole('button', { name: 'Save the time' }))
    expect(state.changed).toHaveLength(1)
    const [id, at, note] = state.changed[0] as [string, Date, string]
    expect(id).toBe('c1')
    expect(at.toISOString()).toBe('2026-11-01T09:30:00.000Z')
    expect(note).toBe('Arrived before the phone did')
  })

  it('lets an Admin remove one, with a reason', async () => {
    state.admin = true
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    await user.click(await screen.findByRole('button', { name: 'Fix Grace Mensah’s clock-in' }))
    await user.click(screen.getByRole('button', { name: 'Remove it instead' }))
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'Not here today')
    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    expect(state.removed).toEqual([['c2', 'Not here today']])
  })

  it('lists every change, with who made it and why', async () => {
    const user = show()
    await open(user, /^Clock-ins/, /^History/)
    const history = await screen.findByText('Phone died at the door', { exact: false })
    const line = history.closest('li')!
    expect(line).toHaveTextContent('Joel Skaria time changed')
    expect(line).toHaveTextContent('09:58 → 09:41')
    expect(line).toHaveTextContent('by Rohit K')
  })
})
