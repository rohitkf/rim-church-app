import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SetupPrompt } from './SetupPrompt'

/*
 * The card somebody gets after being asked to finish setting up (0276).
 * It reminds; it never bars the way.
 */

const env = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  viewAs: null as unknown,
  location: 'unknown' as 'granted' | 'denied' | 'unknown',
  alerts: 'default' as 'default' | 'granted' | 'denied' | 'unsupported',
  standalone: false,
  ios: false,
  touring: false,
  closed: 0,
  toured: 0,
  registered: 0,
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'me', onboarded_at: '2026-01-01T00:00:00Z' }, viewAs: env.viewAs }),
}))
vi.mock('../lib/usePwa', () => ({ usePwa: () => ({ updateReady: false, installPrompt: null }) }))
vi.mock('../lib/pwa', () => ({ isIos: () => env.ios, isStandalone: () => env.standalone }))
vi.mock('../lib/locationPermission', () => ({ useLocationPermission: () => env.location }))
vi.mock('../lib/push', () => ({
  notificationsSupported: () => true,
  permissionState: () => env.alerts,
  requestPermission: () => {
    env.alerts = 'granted'
    return Promise.resolve('granted')
  },
}))
vi.mock('../lib/pushDevice', () => ({
  registerPushDevice: () => {
    env.registered += 1
    return Promise.resolve(true)
  },
}))
vi.mock('../lib/tour', () => ({
  subscribeTour: (listen: (run: unknown) => void) => {
    listen(env.touring ? {} : null)
    return () => undefined
  },
}))
vi.mock('../lib/useStartTour', () => ({ useStartTour: () => () => (env.toured += 1) }))
vi.mock('./InstallApp', () => ({
  InstallAppGuide: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      the install steps
    </button>
  ),
}))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: env.row, error: null }) }) }),
    }),
    rpc: (fn: string) => {
      if (fn === 'close_setup_prompt') {
        env.closed += 1
        if (env.row) env.row = { ...env.row, setup_closed_at: '2099-01-01T00:00:00Z' }
      }
      return Promise.resolve({ data: null, error: null })
    },
  },
}))

const asked = { user_id: 'me', seen: {}, pushed_at: null, setup_asked_at: '2026-11-10T10:00:00Z', setup_closed_at: null }
const toured = { ...asked, seen: { welcome: '2026-10-01T10:00:00Z' } }

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

async function show() {
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<><Where /><SetupPrompt /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  // It waits a moment for the phone to say what it allows.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2_000)
  })
  return view
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  Object.assign(env, {
    row: asked, viewAs: null, location: 'unknown', alerts: 'default', standalone: false, ios: false,
    touring: false, closed: 0, toured: 0, registered: 0,
  })
})
afterEach(() => vi.useRealTimers())

const card = () => screen.queryByRole('dialog', { name: 'A few things are left to set up' })

describe('the card after being asked to finish setting up', () => {
  it('lists what is left on this phone, each with its own button', async () => {
    await show()
    expect(card()).toBeInTheDocument()
    expect(screen.getByText('Take the tour')).toBeInTheDocument()
    expect(screen.getByText('Allow location')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn on notifications' })).toBeInTheDocument()
    expect(screen.getByText('Add the app to your home screen')).toBeInTheDocument()
  })

  it('leaves out what is already done', async () => {
    Object.assign(env, { row: toured, location: 'granted', alerts: 'granted' })
    await show()
    expect(screen.queryByText('Take the tour')).toBeNull()
    expect(screen.queryByText('Allow location')).toBeNull()
    expect(screen.queryByText('Turn on notifications')).toBeNull()
    expect(screen.getByText('Add the app to your home screen')).toBeInTheDocument()
  })

  it('never appears for somebody nobody has asked', async () => {
    env.row = { ...asked, setup_asked_at: null }
    await show()
    expect(card()).toBeNull()
    expect(env.closed).toBe(0)
  })

  it('can be closed, and stays closed until they are asked again', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const first = await show()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(card()).toBeNull()
    await waitFor(() => expect(env.closed).toBe(1))
    first.unmount()
    // The next time the app opens: closed since the ask, so nothing.
    await show()
    expect(card()).toBeNull()
  })

  it('comes back when somebody asks again after a "Not now"', async () => {
    env.row = { ...asked, setup_asked_at: '2026-11-11T09:00:00Z', setup_closed_at: '2026-11-10T11:00:00Z' }
    await show()
    expect(card()).toBeInTheDocument()
  })

  it('closes itself, and the bell’s line, once nothing is left on this phone', async () => {
    Object.assign(env, { row: toured, location: 'granted', alerts: 'granted', standalone: true })
    await show()
    expect(card()).toBeNull()
    await waitFor(() => expect(env.closed).toBe(1))
  })

  it('turns notifications on and registers the phone, then drops the line', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await show()
    await user.click(screen.getByRole('button', { name: 'Turn on notifications' }))
    await waitFor(() => expect(env.registered).toBe(1))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull())
    // Other things are still left, so the card stays and nothing is closed for them.
    expect(card()).toBeInTheDocument()
    expect(env.closed).toBe(0)
  })

  it('says where the block is when notifications are refused, with nothing to press', async () => {
    env.alerts = 'denied'
    await show()
    expect(screen.getByText(/blocked for this site/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on notifications' })).toBeNull()
  })

  it('on an iPhone in the browser, asks for the home screen instead of notifications it cannot have', async () => {
    env.ios = true
    await show()
    expect(screen.queryByText('Turn on notifications')).toBeNull()
    expect(screen.getByText(/the only way notifications reach an iPhone/)).toBeInTheDocument()
  })

  it('starts the tour, and opens the steps for location and for installing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await show()
    const how = screen.getAllByRole('button', { name: 'Show me how' })
    // Installing: the steps open in place of the card, which is there again after.
    await user.click(how[1])
    await user.click(screen.getByRole('button', { name: 'the install steps' }))
    expect(card()).toBeInTheDocument()
    // Location: the page with the steps; the card steps aside without being closed.
    await user.click(screen.getAllByRole('button', { name: 'Show me how' })[0])
    expect(screen.getByTestId('where')).toHaveTextContent('/location')
    expect(card()).toBeNull()
    expect(env.closed).toBe(0)
  })

  it('hands over to the tour without closing the ask', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await show()
    await user.click(screen.getByRole('button', { name: 'Start the tour' }))
    expect(env.toured).toBe(1)
    expect(card()).toBeNull()
    expect(env.closed).toBe(0)
  })

  it('waits while the tour is running, and for an Admin previewing as somebody else', async () => {
    env.touring = true
    const first = await show()
    expect(card()).toBeNull()
    first.unmount()
    env.touring = false
    env.viewAs = { kind: 'member' }
    await show()
    expect(card()).toBeNull()
    expect(env.closed).toBe(0)
  })
})
