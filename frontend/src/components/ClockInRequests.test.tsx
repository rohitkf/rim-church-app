import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInRequests } from './ClockInRequests'

/*
 * Answering a request to be clocked in: where the phone thought they were
 * is there before the answer; the map only for the Owner and Admins.
 */

const state = vi.hoisted(() => ({
  admin: false,
  requests: [] as unknown[],
  decided: [] as unknown[],
  lookups: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: state.admin, isSuperAdmin: false }),
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ timezone: 'Europe/London', clock_in_radius_m: 100 }) }))
vi.mock('./PlaceMap', () => ({
  PlaceMap: ({ reading }: { reading: { lat: number } }) => <p>map with their phone at {reading.lat}</p>,
}))
vi.mock('../lib/clockIn', async (original) => ({
  ...(await original<typeof import('../lib/clockIn')>()),
  fetchClockInRequestsToAnswer: () => Promise.resolve(state.requests),
  fetchClockInPlace: () =>
    Promise.resolve({ label: 'Church', postcode: null, latitude: 51.5, longitude: -0.12, updated_at: '2026-10-01T00:00:00Z' }),
  decideClockInRequest: (...args: unknown[]) => {
    state.decided.push(args)
    return Promise.resolve()
  },
  lookUpAddresses: () => {
    state.lookups += 1
  },
}))

const request = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  user_id: 'p1',
  on_date: '2026-11-01',
  asked_at: '2026-11-01T09:31:00Z',
  note: 'In the hall',
  latitude: 51.503,
  longitude: -0.12,
  accuracy_m: 22,
  distance_m: 340,
  read_at: '2026-11-01T09:30:40Z',
  failed_because: 'too_far',
  address: '1 Hall Road, Reading',
  address_tries: 1,
  person: { first_name: 'Joel', last_name: 'Skaria' },
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ClockInRequests />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.admin = false
  state.requests = []
  state.decided = []
  state.lookups = 0
})

describe('requests to be clocked in', () => {
  it('shows nothing when none is waiting', async () => {
    show()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('says who, when they asked, and where their phone thought they were', async () => {
    state.requests = [request()]
    show()
    const item = await screen.findByRole('listitem', { name: 'Joel Skaria’s request' })
    expect(item).toHaveTextContent('asked at 09:31')
    expect(item).toHaveTextContent('Phone placed them outside the circle')
    expect(item).toHaveTextContent('1 Hall Road, Reading')
    expect(item).toHaveTextContent('340 m from church · ± 22 m · read 09:30')
    expect(item).toHaveTextContent('“In the hall”')
    // The map is the Owner's and Admins'.
    expect(within(item).queryByText(/map with their phone/)).toBeNull()
  })

  it('gives the Owner and Admins the map as well', async () => {
    state.admin = true
    state.requests = [request()]
    show()
    expect(await screen.findByText('map with their phone at 51.503')).toBeInTheDocument()
  })

  it('says when they say they arrived, and that approving clocks them in then (0225)', async () => {
    state.requests = [request({ arrived_at: '2026-11-01T09:05:00Z' })]
    show()
    const item = await screen.findByRole('listitem', { name: 'Joel Skaria’s request' })
    expect(item).toHaveTextContent('says they arrived at 09:05 · asked at 09:31')
    expect(item).toHaveTextContent('Approving clocks them in at the time they arrived.')
  })

  it('says so when the phone gave no location', async () => {
    state.requests = [
      request({ latitude: null, longitude: null, accuracy_m: null, distance_m: null, address: null, failed_because: 'blocked' }),
    ]
    show()
    expect(await screen.findByText('No location — their phone gave none.')).toBeInTheDocument()
    expect(screen.getByText('Location is blocked on their phone')).toBeInTheDocument()
  })

  it('approves, or declines with a reason', async () => {
    state.requests = [request(), request({ id: 'r2', person: { first_name: 'Ama', last_name: 'Owusu' } })]
    const user = show()
    const first = await screen.findByRole('listitem', { name: 'Joel Skaria’s request' })
    await user.click(within(first).getByRole('button', { name: 'Approve' }))
    const second = screen.getByRole('listitem', { name: 'Ama Owusu’s request' })
    await user.click(within(second).getByRole('button', { name: 'Decline…' }))
    await user.type(within(second).getByRole('textbox', { name: 'Why not' }), 'Not seen')
    await user.click(within(second).getByRole('button', { name: 'Decline' }))
    expect(state.decided).toEqual([
      ['r1', true, ''],
      ['r2', false, 'Not seen'],
    ])
  })

  it('asks for the street of a reading that has none yet', async () => {
    state.requests = [request({ address: null, address_tries: 0 })]
    show()
    expect(await screen.findByText('Looking up the address…')).toBeInTheDocument()
    expect(state.lookups).toBe(1)
  })
})
