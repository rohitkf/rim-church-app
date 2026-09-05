import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AvailabilityPage } from './AvailabilityPage'

/*
 * The three-week tracker.
 *
 * What matters here is not the answering — that has not changed — but
 * which services are on the page at all, and which of them are open when
 * it is first drawn. Those are the two things the split decides.
 */

const SUNDAY = '2026-09-06'
const NEXT = '2026-09-13'
const AFTER = '2026-09-20'
const MONTHS_OUT = '2026-12-06'

const state = vi.hoisted(() => ({ finished: new Set<string>() }))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'u1' } },
    isAdmin: false,
    isDepartmentHead: () => false,
  }),
}))

vi.mock('../lib/monthGrid', () => ({ todayIso: () => SUNDAY }))
vi.mock('../lib/useTeamStyle', () => ({ useTeamStyle: () => ({ teamStyle: 'dot' }) }))
vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ rota_window_days: 7 }) }))
vi.mock('../lib/useFinishedServices', () => ({
  useFinishedServices: () => ({ isFinished: (id: string) => state.finished.has(id) }),
}))
vi.mock('../components/NudgeButton', () => ({ NudgeButton: () => null }))

vi.mock('../lib/queries', () => ({
  fetchServices: () =>
    Promise.resolve([
      { id: 's1', date: SUNDAY, service_type: 'English Service' },
      // Two on one morning: the case the day headings exist for.
      { id: 's1b', date: SUNDAY, service_type: 'Malayalam Service' },
      { id: 's2', date: NEXT, service_type: 'English Service' },
      { id: 's3', date: AFTER, service_type: 'English Service' },
      { id: 's4', date: MONTHS_OUT, service_type: 'Carol Service' },
    ]),
  fetchDepartments: () =>
    Promise.resolve([{ id: 'd1', name: 'Media', color: '#3b82f6', is_worship: false }]),
  fetchOwnDepartmentIds: () => Promise.resolve(['d1']),
}))

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AvailabilityPage />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

/*
 * A day's section, found by its heading, and a service's card within it.
 * The date is rendered through `toLocaleDateString`, so it is matched
 * loosely rather than pinned to whichever locale the runner is in.
 */
const dayFor = (day: string | RegExp) =>
  screen.getByRole('heading', { name: day, level: 2 }).closest('section')!

/** One service inside a day, by the name on its own heading. */
const cardFor = (day: string | RegExp, service = 'English Service') =>
  within(dayFor(day)).getByRole('heading', { name: service, level: 2 }).closest('section')!

const teamsOf = (card: HTMLElement) => card.querySelector('ul[id^="availability-teams-"]')!

beforeEach(() => {
  state.finished = new Set()
})

describe('the availability tracker over three weeks', () => {
  it('reaches three Sundays out, not just this week', async () => {
    // The window used to be the rota's seven days, so the answer somebody
    // already knew about the third Sunday had nowhere to go.
    show()
    await screen.findByRole('heading', { name: /Today/ })
    expect(screen.getByText(/September 13/)).toBeInTheDocument()
    expect(screen.getByText(/September 20/)).toBeInTheDocument()
  })

  it('still stops at three weeks — a Carol service in December is not this', async () => {
    show()
    await screen.findByRole('heading', { name: /Today/ })
    expect(screen.queryByText(/December/)).not.toBeInTheDocument()
  })

  it('opens the soonest service and folds the rest', async () => {
    show()
    await screen.findByRole('heading', { name: /Today/ })
    expect(teamsOf(cardFor(/Today/))).not.toHaveAttribute('hidden')
    expect(teamsOf(cardFor(/September 13/))).toHaveAttribute('hidden')
    expect(teamsOf(cardFor(/September 20/))).toHaveAttribute('hidden')
  })

  it('files everything past the next occasion under its own heading', async () => {
    show()
    await screen.findByRole('heading', { name: /Today/ })
    const heading = screen.getByRole('heading', { name: 'Upcoming services availability' })
    const section = heading.closest('section')!
    expect(within(section).getByText(/September 13/)).toBeInTheDocument()
    expect(within(section).getByText(/September 20/)).toBeInTheDocument()
    // The one in front of you is not filed under "upcoming".
    expect(within(section).queryByText(/Today/)).not.toBeInTheDocument()
  })

  it('gathers a morning’s services under one date, said once', async () => {
    show()
    const today = await screen.findByRole('heading', { name: /Today/ })
    const day = today.closest('section')!
    // Both services on the morning, under the one heading…
    expect(within(day).getByRole('heading', { name: 'English Service' })).toBeInTheDocument()
    expect(within(day).getByRole('heading', { name: 'Malayalam Service' })).toBeInTheDocument()
    expect(within(day).getByText('2 services')).toBeInTheDocument()
    // …and the date is not repeated on the cards underneath it.
    expect(within(day).getAllByText(/September 6/)).toHaveLength(1)
  })

  it('opens a folded service on a touch', async () => {
    const user = show()
    await screen.findByRole('heading', { name: /Today/ })
    const later = cardFor(/September 13/)
    expect(teamsOf(later)).toHaveAttribute('hidden')
    await user.click(within(later).getByRole('button', { expanded: false }))
    await waitFor(() => expect(teamsOf(later)).not.toHaveAttribute('hidden'))
  })

  it('closes the open one on a touch, for somebody who wants it out of the way', async () => {
    const user = show()
    await screen.findByRole('heading', { name: /Today/ })
    const soonest = cardFor(/Today/)
    expect(teamsOf(soonest)).not.toHaveAttribute('hidden')
    await user.click(within(soonest).getByRole('button', { expanded: true }))
    await waitFor(() => expect(teamsOf(soonest)).toHaveAttribute('hidden'))
  })

  it('moves on to the next day once the whole of today has finished', async () => {
    // Both of this morning's services are a record now — the line is
    // drawn at a day, so one of the two finishing would not move it. The
    // 13th is the question, so it opens.
    state.finished = new Set(['s1', 's1b'])
    show()
    await screen.findByRole('heading', { name: /Today/ })
    const next = cardFor(/September 13/)
    expect(teamsOf(next)).not.toHaveAttribute('hidden')
    expect(teamsOf(cardFor(/Today/))).toHaveAttribute('hidden')
  })
})
