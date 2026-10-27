import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
vi.mock('../lib/clockIn', async (original) => ({
  ...(await original<typeof import('../lib/clockIn')>()),
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

beforeEach(() => {
  state.admin = false
  state.changed = []
  state.removed = []
  state.lookups = 0
})

describe('the Clock In page', () => {
  it('shows who arrived, when, and where — and asks for the addresses still missing', async () => {
    show()
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Joel Skaria')).toBeInTheDocument()
    expect(within(table).getByText('09:41')).toBeInTheDocument()
    expect(within(table).getByText('12 High Street, Reading')).toBeInTheDocument()
    expect(within(table).getByText('Looking up the address…')).toBeInTheDocument()
    expect(state.lookups).toBe(1)
  })

  it('gives nobody but the Owner and Admins the church’s spot or a way to change anything', async () => {
    show()
    await screen.findByRole('table')
    expect(screen.queryByText('Where the church is')).toBeNull()
    expect(screen.queryByRole('button', { name: /Fix Joel/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a clock-in' })).toBeNull()
  })

  it('lets an Admin change a time, with a reason', async () => {
    state.admin = true
    const user = show()
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
    await user.click(await screen.findByRole('button', { name: 'Fix Grace Mensah’s clock-in' }))
    await user.click(screen.getByRole('button', { name: 'Remove it instead' }))
    await user.type(screen.getByRole('textbox', { name: 'Why' }), 'Not here today')
    await user.click(screen.getByRole('button', { name: 'Remove it' }))
    expect(state.removed).toEqual([['c2', 'Not here today']])
  })

  it('lists every change, with who made it and why', async () => {
    show()
    const history = await screen.findByText('Phone died at the door', { exact: false })
    const line = history.closest('li')!
    expect(line).toHaveTextContent('Joel Skaria time changed')
    expect(line).toHaveTextContent('09:58 → 09:41')
    expect(line).toHaveTextContent('by Rohit K')
  })
})
