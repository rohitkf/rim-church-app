import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WhatsNew } from './WhatsNew'
import { RELEASES } from '../lib/releases'
import { endTour, startTour } from '../lib/tour'
import { TOUR_CHAPTERS } from '../lib/tour'

/*
 * What is new: a line at the top of the screen, once per account, with
 * the details behind a button. It opens nothing by itself.
 */

const auth = vi.hoisted(() => ({
  profile: { id: 'me', onboarded_at: '2026-10-01T10:00:00Z' } as { id: string; onboarded_at: string | null } | null,
  viewAs: null as unknown,
}))
const db = vi.hoisted(() => ({ seen: {} as Record<string, string>, marked: [] as string[], canOpen: true, holds: true }))
const pwa = vi.hoisted(() => ({ updateReady: false }))
vi.mock('../lib/usePwa', () => ({ usePwa: () => pwa }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => auth }))
// Somebody who holds every right, so a release about one (`holds`) is theirs to be told.
vi.mock('../lib/usePermissions', () => ({ usePermissions: () => ({ can: () => db.holds }) }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ settled: true, canOpen: () => db.canOpen, standing: 'church' }) }))
vi.mock('../lib/onboarding', async () => {
  const actual = await vi.importActual<typeof import('../lib/onboarding')>('../lib/onboarding')
  return {
    ...actual,
    fetchMyOnboarding: () => Promise.resolve({ user_id: 'me', seen: {}, pushed_at: null, releases_seen: db.seen }),
    markReleaseSeen: (key: string) => {
      db.marked.push(key)
      db.seen = { ...db.seen, [key]: '2026-11-15T15:00:00Z' }
      return Promise.resolve()
    },
  }
})

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function show() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
        <button type="button">Tick the checklist</button>
        <WhatsNew />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Everything seen but these. */
const seenAllBut = (...keys: string[]) =>
  Object.fromEntries(RELEASES.filter((r) => !keys.includes(r.key)).map((r) => [r.key, '2026-11-01T10:00:00Z']))
const notice = () => screen.findByRole('status', { name: 'The app was updated' })
const quiet = async () => {
  await new Promise((r) => setTimeout(r, 50))
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
}

beforeEach(() => {
  endTour()
  auth.profile = { id: 'me', onboarded_at: '2026-10-01T10:00:00Z' }
  auth.viewAs = null
  pwa.updateReady = false
  db.seen = seenAllBut('not-ended')
  db.marked = []
  db.canOpen = true
  db.holds = true
})

describe('what is new', () => {
  it('says the app was updated in a line at the top, and opens nothing by itself', async () => {
    show()
    expect(await notice()).toHaveTextContent('The app was updated')
    expect(screen.queryByRole('dialog')).toBeNull()
    // What they were doing is still theirs to do.
    expect(screen.getByRole('button', { name: 'Tick the checklist' })).toBeEnabled()
    expect(db.marked).toEqual([])
  })

  it('shows the details when asked, and remembers on the account that they were told', async () => {
    const user = userEvent.setup()
    show()
    await notice()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    expect(within(sheet).getByRole('heading', { name: 'Not ended' })).toBeInTheDocument()
    expect(within(sheet).getByText(/stays on past its time/)).toBeInTheDocument()
    await waitFor(() => expect(db.marked).toEqual(['not-ended']))
    // The sheet stays until they close it, though the account now says seen.
    expect(screen.getByRole('dialog', { name: 'What’s new' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))
    await quiet()
  })

  it('goes away on Dismiss, without showing anything, and is not offered again', async () => {
    const user = userEvent.setup()
    show()
    await notice()
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(db.marked).toEqual(['not-ended']))
    await quiet()
  })

  it('lists every release they have not been told about, newest first, in the one sheet', async () => {
    db.seen = seenAllBut('dashboard-glimpse', 'not-ended', 'countdown')
    const user = userEvent.setup()
    show()
    await notice()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    expect(within(sheet).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'What is on, at a glance',
      'Not ended',
      'Countdown',
    ])
    await waitFor(() => expect([...db.marked].sort()).toEqual(['countdown', 'dashboard-glimpse', 'not-ended']))
  })

  it('names the newest five of a long list and counts the rest', async () => {
    db.seen = {}
    const user = userEvent.setup()
    show()
    await notice()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    expect(within(sheet).getAllByRole('heading', { level: 3 })).toHaveLength(5)
    expect(within(sheet).getByText(`And ${RELEASES.length - 5} earlier changes.`)).toBeInTheDocument()
    // All of them are remembered as told, not only the five named.
    await waitFor(() => expect(db.marked).toHaveLength(RELEASES.length))
  })

  it('takes them to a release’s page from the sheet', async () => {
    const user = userEvent.setup()
    show()
    await notice()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    await user.click(await screen.findByRole('button', { name: 'Open Countdown' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/countdown')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says nothing about a page this person cannot open', async () => {
    // Registrations and Reception have pages; clocking in is for everybody.
    db.seen = seenAllBut('registrations', 'reception', 'clock-in')
    db.canOpen = false
    const user = userEvent.setup()
    show()
    await notice()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    expect(within(sheet).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Clock in when you arrive'])
    await waitFor(() => expect(db.marked).toEqual(['clock-in']))
  })

  it('says nothing about a right this person does not hold, on a page they can open', async () => {
    // Private comments on a session are a Pastor's to write and the Admins' to read (0308).
    db.seen = seenAllBut('session-comments')
    db.holds = false
    show()
    await quiet()
  })

  it('tells somebody who holds the right', async () => {
    db.seen = seenAllBut('session-comments')
    const user = userEvent.setup()
    show()
    await notice()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    const sheet = await screen.findByRole('dialog', { name: 'What’s new' })
    expect(within(sheet).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Private comments on a session'])
  })

  it('is not there at all when the only news is a page they cannot open', async () => {
    db.seen = seenAllBut('registrations')
    db.canOpen = false
    show()
    await quiet()
  })

  it('stays quiet when everything has been seen, during the tour, while previewing, and before joining is done', async () => {
    db.seen = seenAllBut()
    const a = show()
    await quiet()
    a.unmount()

    db.seen = seenAllBut('not-ended')
    startTour([TOUR_CHAPTERS[0]], 'manual')
    const b = show()
    await quiet()
    endTour()
    expect(await notice()).toBeInTheDocument()
    b.unmount()

    auth.viewAs = { as: 'member' }
    const c = show()
    await quiet()
    c.unmount()

    auth.viewAs = null
    auth.profile = { id: 'me', onboarded_at: null }
    show()
    await quiet()
    expect(db.marked).toEqual([])
  })

  it('yields to a new version waiting to be reloaded into, and comes back after it', async () => {
    pwa.updateReady = true
    const a = show()
    await quiet()
    expect(db.marked).toEqual([])
    a.unmount()
    pwa.updateReady = false
    show()
    expect(await notice()).toBeInTheDocument()
  })
})
