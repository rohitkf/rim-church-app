import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ClockInPanel } from './ClockInPanel'
import { forgetLocationPermission, reportLocation } from '../lib/locationPermission'

/*
 * CLOCK IN on the Dashboard: there only while it is open, big, honest
 * about how sure the phone is, and plain about why when it says no.
 */

const state = vi.hoisted(() => ({
  today: { due: false } as Record<string, unknown>,
  teamIds: [] as string[],
  reading: null as null | { lat: number; lng: number; accuracy: number; at: number },
  readingError: null as unknown,
  result: null as unknown,
  sent: [] as unknown[],
  asked: [] as unknown[],
  cancelled: [] as unknown[],
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
  askToClockIn: (a: unknown) => {
    state.asked.push(a)
    return Promise.resolve()
  },
  cancelClockInAsk: (id: unknown) => {
    state.cancelled.push(id)
    return Promise.resolve()
  },
}))
vi.mock('../lib/clockInReading', async (original) => ({
  ...(await original<typeof import('../lib/clockInReading')>()),
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
  forgetLocationPermission()
  browserSays('granted')
  state.teamIds = []
  state.reading = { lat: 51.5, lng: -0.1, accuracy: 18, at: Date.now() }
  state.readingError = null
  state.result = null
  state.sent = []
  state.asked = []
  state.cancelled = []
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

describe('asking to be clocked in instead', () => {
  it('sends the reading from the failed try, with a note', async () => {
    state.today = openDay()
    state.result = { ok: false, reason: 'too_far', distance_m: 340, radius_m: 100 }
    const user = show()
    await user.click(await screen.findByRole('button', { name: /clock in/i }))
    await user.click(await screen.findByRole('button', { name: 'Ask to be clocked in' }))
    expect(screen.getByText(/will see where your phone thought you were/)).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Note for the approver' }), 'In the hall')
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(state.asked).toEqual([{ reading: state.reading, failedBecause: 'too_far', note: 'In the hall' }])
  })

  it('can ask with no location when location is blocked', async () => {
    state.today = openDay()
    const { LocationRefused } = await import('../lib/clockInReading')
    state.readingError = new LocationRefused('blocked')
    const user = show()
    await user.click(await screen.findByRole('button', { name: /clock in/i }))
    await user.click(await screen.findByRole('button', { name: 'Ask to be clocked in' }))
    expect(screen.getByText(/gave no location/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(state.asked).toEqual([{ reading: null, failedBecause: 'blocked', note: '' }])
  })

  it('is not offered before a try has failed', async () => {
    state.today = openDay()
    show()
    await screen.findByRole('button', { name: /clock in/i })
    expect(screen.queryByRole('button', { name: 'Ask to be clocked in' })).toBeNull()
  })

  it('shows a request waiting, and lets them take it back', async () => {
    state.today = {
      ...openDay(),
      request: { id: 'r1', status: 'pending', asked_at: '2026-11-01T09:31:00Z', decision_note: null },
    }
    const user = show()
    expect(await screen.findByText(/waiting for approval/)).toHaveTextContent('09:31')
    await user.click(screen.getByRole('button', { name: 'Cancel request' }))
    expect(state.cancelled).toEqual(['r1'])
  })

  it('says when it was declined, and why', async () => {
    state.today = {
      ...openDay(),
      request: { id: 'r1', status: 'declined', asked_at: '2026-11-01T09:31:00Z', decision_note: 'Not seen at church' },
    }
    show()
    expect(await screen.findByText(/declined: Not seen at church/)).toBeInTheDocument()
  })
})

/** What the browser's own Permissions API claims — which an iPhone gets wrong. */
function browserSays(state: PermissionState) {
  Object.defineProperty(navigator, 'permissions', {
    value: { query: () => Promise.resolve({ state, addEventListener() {}, removeEventListener() {} }) },
    configurable: true,
  })
}

describe('when location is blocked', () => {
  it('says how to unblock it once the phone has actually refused', async () => {
    state.teamIds = ['media']
    browserSays('prompt')
    show()
    reportLocation('denied')
    expect(await screen.findByText(/Location is blocked for this app/)).toBeInTheDocument()
  })

  it('does not believe the browser saying "denied" when the phone hands over its position', async () => {
    // An iPhone: the Permissions API says denied; the dot above found the phone 5 km out.
    state.teamIds = ['media']
    browserSays('denied')
    show()
    reportLocation('granted')
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText(/Location is blocked/)).toBeNull()
  })

  it('says nothing before the phone has answered, whatever the browser claims', async () => {
    state.teamIds = ['media']
    browserSays('denied')
    show()
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText(/Location is blocked/)).toBeNull()
  })

  it('says nothing to somebody on no team even when it is blocked', async () => {
    show()
    reportLocation('denied')
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.queryByText(/Location is blocked/)).toBeNull()
  })
})
