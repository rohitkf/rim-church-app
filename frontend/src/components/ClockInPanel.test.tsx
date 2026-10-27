import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInPanel } from './ClockInPanel'

/*
 * CLOCK IN on the Dashboard: there only while it is open, big, honest
 * about how sure the phone is, and plain about why when it says no.
 */

const state = vi.hoisted(() => ({
  today: { due: false } as Record<string, unknown>,
  permission: 'granted' as string,
  teamIds: [] as string[],
  reading: null as null | { lat: number; lng: number; accuracy: number; at: number },
  readingError: null as unknown,
  result: null as unknown,
  sent: [] as unknown[],
  lookedUp: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'me' } }, isAdmin: false, isSuperAdmin: false }),
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ timezone: 'Europe/London', clock_in_accuracy_m: 50 }) }))
vi.mock('../lib/useMyTeams', () => ({ useMyTeams: () => ({ teamIds: state.teamIds, onATeam: true, settled: true }) }))
vi.mock('../lib/clockIn', async (original) => ({
  ...(await original<typeof import('../lib/clockIn')>()),
  fetchMyClockIn: () => Promise.resolve(state.today),
  submitClockIn: (r: unknown) => {
    state.sent.push(r)
    return Promise.resolve(state.result)
  },
  lookUpAddresses: () => {
    state.lookedUp += 1
  },
}))
vi.mock('../lib/clockInReading', async (original) => ({
  ...(await original<typeof import('../lib/clockInReading')>()),
  locationPermission: () => Promise.resolve({ state: state.permission, status: null }),
  readBestPosition: () => ({
    done: state.readingError ? Promise.reject(state.readingError) : Promise.resolve(state.reading),
    cancel: () => undefined,
  }),
}))

const minutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ClockInPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const openDay = () => ({
  due: true,
  on_date: '2026-11-01',
  first_call: minutes(3),
  opens_at: minutes(-2),
  closes_at: minutes(180),
  place_set: true,
  accuracy_m: 50,
  radius_m: 100,
  clocked_at: null,
  method: null,
})

beforeEach(() => {
  state.today = { due: false }
  state.permission = 'granted'
  state.teamIds = []
  state.reading = { lat: 51.5, lng: -0.1, accuracy: 18, at: Date.now() }
  state.readingError = null
  state.result = null
  state.sent = []
  state.lookedUp = 0
})

describe('the CLOCK IN button', () => {
  it('is not there too early', async () => {
    state.today = { ...openDay(), opens_at: minutes(20), first_call: minutes(25) }
    show()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('button', { name: /clock in/i })).toBeNull()
  })

  it('is there once it opens, and clocks them in with the phone’s best reading', async () => {
    state.today = openDay()
    state.result = { ok: true, clocked_at: '2026-11-01T09:27:00Z', distance_m: 22, marked: 2 }
    const user = show()
    await user.click(await screen.findByRole('button', { name: /clock in/i }))
    expect(await screen.findByText('You are marked Present on 2 teams.')).toBeInTheDocument()
    expect(screen.getByText('09:27')).toBeInTheDocument()
    expect(state.sent).toEqual([state.reading])
    expect(state.lookedUp).toBe(1)
  })

  it('says why when the phone was not sure enough, with what to try', async () => {
    state.today = openDay()
    state.result = { ok: false, reason: 'too_rough', accuracy_m: 140, needed_m: 50 }
    const user = show()
    await user.click(await screen.findByRole('button', { name: /clock in/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('± 140 m')
    expect(alert).toHaveTextContent('Wi-Fi')
    // Still there to try again.
    expect(screen.getByRole('button', { name: /clock in/i })).toBeEnabled()
  })

  it('says how to unblock location when it is blocked', async () => {
    state.today = openDay()
    const { LocationRefused } = await import('../lib/clockInReading')
    state.readingError = new LocationRefused('blocked')
    const user = show()
    await user.click(await screen.findByRole('button', { name: /clock in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Location Services')
    expect(state.sent).toEqual([])
  })

  it('is one quiet line once they have clocked in', async () => {
    state.today = { ...openDay(), clocked_at: '2026-11-01T09:26:00Z', method: 'location' }
    show()
    expect(await screen.findByRole('status')).toHaveTextContent('Clocked in at 09:26')
    expect(screen.queryByRole('button', { name: /clock in/i })).toBeNull()
  })
})

describe('asking for the location beforehand', () => {
  it('asks somebody on a team who has not allowed it yet', async () => {
    state.teamIds = ['media']
    state.permission = 'prompt'
    show()
    expect(await screen.findByRole('button', { name: 'Allow location' })).toBeInTheDocument()
  })

  it('says how to unblock it when it is blocked', async () => {
    state.teamIds = ['media']
    state.permission = 'denied'
    show()
    expect(await screen.findByText(/Location is blocked for this app/)).toBeInTheDocument()
  })

  it('says nothing to somebody on no team, or who has allowed it', async () => {
    state.permission = 'prompt'
    show()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByRole('button', { name: 'Allow location' })).toBeNull()
  })
})
