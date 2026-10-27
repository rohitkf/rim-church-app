import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WhatsNew } from './WhatsNew'
import { endTour, startTour } from '../lib/tour'
import { TOUR_CHAPTERS } from '../lib/tour'

/*
 * The release card: once per account, after the tour, never while
 * previewing as somebody else.
 */

const auth = vi.hoisted(() => ({
  profile: { id: 'me', onboarded_at: '2026-10-01T10:00:00Z' } as { id: string; onboarded_at: string | null } | null,
  viewAs: null as unknown,
}))
const db = vi.hoisted(() => ({ seen: {} as Record<string, string>, marked: [] as string[], canOpen: true }))
const pwa = vi.hoisted(() => ({ updateReady: false }))
vi.mock('../lib/usePwa', () => ({ usePwa: () => pwa }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ settled: true, canOpen: () => db.canOpen, standing: 'church' }) }))
vi.mock('../lib/onboarding', async () => {
  const actual = await vi.importActual<typeof import('../lib/onboarding')>('../lib/onboarding')
  return {
    ...actual,
    fetchMyOnboarding: () => Promise.resolve({ user_id: 'me', seen: {}, pushed_at: null, releases_seen: db.seen }),
    markReleaseSeen: (key: string) => {
      db.marked.push(key)
      return Promise.resolve()
    },
  }
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function show() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
        <WhatsNew />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  endTour()
  auth.profile = { id: 'me', onboarded_at: '2026-10-01T10:00:00Z' }
  auth.viewAs = null
  // The newer cards (phones, 0185; clock in, 0194) have their own tests below; these follow Stage Layout's.
  db.seen = { ...NEWER }
  db.marked = []
  db.canOpen = true
})

const NEWER = { 'clock-in': '2026-10-27T10:00:00Z', 'talk-on-your-phone': '2026-10-25T10:00:00Z' }

describe('what is new', () => {
  it('announces the newest release once, and remembers on the account when it is closed', async () => {
    const user = userEvent.setup()
    show()
    expect(await screen.findByRole('dialog', { name: 'New: Stage Layout' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Later' }))
    await waitFor(() => expect(db.marked).toEqual(['stage-layout']))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('takes them there on the button, and still marks it seen', async () => {
    const user = userEvent.setup()
    show()
    await user.click(await screen.findByRole('button', { name: 'Open Stage Layout' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/stage')
    await waitFor(() => expect(db.marked).toEqual(['stage-layout']))
  })

  it('stays quiet when it has been seen, during the tour, while previewing, and before joining is done', async () => {
    db.seen = { ...NEWER, 'stage-layout': '2026-10-17T10:00:00Z' }
    const a = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WhatsNew />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
    a.unmount()

    db.seen = { ...NEWER }
    startTour([TOUR_CHAPTERS[0]], 'manual')
    show()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
    endTour()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('yields to a new version waiting to be reloaded into, and comes back after it', async () => {
    pwa.updateReady = true
    const a = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WhatsNew />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(db.marked).toEqual([])
    a.unmount()
    pwa.updateReady = false
    show()
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('says nothing about a page this person cannot open', async () => {
    db.canOpen = false
    show()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tells everybody about clocking in, newest first', async () => {
    db.seen = {}
    db.canOpen = false
    const user = userEvent.setup()
    show()
    expect(await screen.findByRole('dialog', { name: 'New: Clock in when you arrive' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(db.marked).toEqual(['clock-in']))
  })

  it('tells everybody that board posts and team chat now reach the phone', async () => {
    db.seen = { 'clock-in': '2026-10-27T10:00:00Z' }
    db.canOpen = false
    const user = userEvent.setup()
    show()
    expect(await screen.findByRole('dialog', { name: 'New: Board posts and team chat on your phone' })).toBeInTheDocument()
    // Nowhere to send them but Settings, so it only closes.
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(db.marked).toEqual(['talk-on-your-phone']))
  })
})
