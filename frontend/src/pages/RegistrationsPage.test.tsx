import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationsPage } from './RegistrationsPage'
import { groupEvents, type EventSummary } from '../lib/registrations'

/*
 * Registrations (0244): every event people can sign up for, how each
 * stands, and its link ready to copy — grouped by where each is, and
 * saying what wants doing on it.
 */

/** Days from now, so the groups hold whenever the tests run. */
const daysOn = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

const state = vi.hoisted(() => ({ events: [] as unknown[] }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/appSettings', async (original) => ({
  ...(await original<typeof import('../lib/appSettings')>()),
  useAppSettings: () => ({ registration_retention_days: 90 }),
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchRegistrationEvents: () => Promise.resolve(state.events),
}))

const summary = (over: Partial<EventSummary>): EventSummary => ({
  id: 'e1',
  slug: 'pastors-2026',
  title: 'Pastors & Leaders 2026',
  description: null,
  image_path: null,
  status: 'published',
  date_mode: 'all',
  location_name: 'Church Hall',
  address: null,
  latitude: null,
  longitude: null,
  registration_opens_at: null,
  registration_closes_at: null,
  min_per_order: 1,
  max_per_order: 10,
  payment_links: [],
  payment_accounts: [],
  payment_use_church_giving: true,
  payment_note: null,
  allow_pay_at_reception: true,
  add_to_diary: false,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  orders: 12,
  tickets: 20,
  expected_pence: 40000,
  received_pence: 30000,
  waived_pence: 0,
  awaiting: 3,
  reported: 0,
  owed: 0,
  first_starts_at: daysOn(18),
  last_ends_at: daysOn(18),
  anonymised: false,
  ...over,
})

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RegistrationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  state.events = [summary({}), summary({ id: 'e2', slug: 'youth-night', title: 'Youth Night', status: 'draft', orders: 0, tickets: 0, expected_pence: 0, received_pence: 0, awaiting: 0, first_starts_at: null, last_ends_at: null })]
})

describe('the Registrations page', () => {
  it('lists every event with where it stands and its link', async () => {
    const user = show()
    const card = await screen.findByRole('listitem', { name: 'Pastors & Leaders 2026' })
    expect(within(card).getByText('Taking registrations')).toBeInTheDocument()
    expect(within(card).getByText('3 not paid yet')).toBeInTheDocument()
    expect(within(card).getByText('12 orders · £300.00 of £400.00 received')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: '£300.00 of £400.00 received' })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /register\/pastors-2026/ })).toHaveAttribute('href', 'https://rim-church-app.vercel.app/register/pastors-2026')
    await user.click(within(card).getByRole('button', { name: 'Copy link' }))
    expect(await navigator.clipboard.readText()).toBe('https://rim-church-app.vercel.app/register/pastors-2026')
    expect(within(card).getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    const draft = screen.getByRole('listitem', { name: 'Youth Night' })
    expect(within(draft).getByText('Draft')).toBeInTheDocument()
    expect(within(draft).getByText(/No date yet/)).toBeInTheDocument()
  })

  /*
   * A finished event counts down to the night people's details come off
   * its registrations (the Owner's ask, November 2026). The event itself
   * is not deleted by anything, and the line does not say it is.
   */
  it('counts a finished event down to when names and contact details are removed', async () => {
    state.events = [
      summary({ id: 'done', title: 'Harvest Supper', status: 'closed', first_starts_at: daysOn(-10), last_ends_at: daysOn(-10) }),
      summary({ id: 'open', title: 'Carol Service' }),
    ]
    show()
    const done = await screen.findByRole('listitem', { name: 'Harvest Supper' })
    // Ninety days from its last date, then the night's run: 79 or 80 days left, to the hour.
    expect(within(done).getByRole('timer')).toHaveTextContent(/^Names and contact details removed in (79|80) days \d+ hrs?$/)
    // Nothing is counting on an event still to come.
    const open = screen.getByRole('listitem', { name: 'Carol Service' })
    expect(within(open).queryByRole('timer')).toBeNull()
    expect(within(open).queryByText(/removed/)).toBeNull()
  })

  it('says so, without a count, once they have been removed', async () => {
    state.events = [summary({ id: 'old', title: 'Easter Retreat', status: 'closed', first_starts_at: daysOn(-200), last_ends_at: daysOn(-200), anonymised: true })]
    show()
    const old = await screen.findByRole('listitem', { name: 'Easter Retreat' })
    expect(within(old).getByText('Names and contact details removed')).toBeInTheDocument()
    expect(within(old).queryByRole('timer')).toBeNull()
  })

  it('says tonight for one whose days have run out and which still has its names', async () => {
    state.events = [summary({ id: 'due', title: 'Summer Camp', status: 'closed', first_starts_at: daysOn(-100), last_ends_at: daysOn(-100) })]
    show()
    const due = await screen.findByRole('listitem', { name: 'Summer Camp' })
    expect(within(due).getByText('Names and contact details removed tonight')).toBeInTheDocument()
  })

  it('says what was waived beside the money received, never inside it', async () => {
    // £300 came in and £30 was let go: £300 received, not £330.
    state.events = [summary({ waived_pence: 3000 })]
    show()
    const card = await screen.findByRole('listitem', { name: 'Pastors & Leaders 2026' })
    expect(within(card).getByText('12 orders · £300.00 of £400.00 received · £30.00 waived')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: '£300.00 of £400.00 received' })).toBeInTheDocument()
  })

  it('adds the events up, and leads to a new one', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Youth Night' })
    const stat = (unit: string) => screen.getByText(unit).parentElement!.querySelector('.text-numeral')!.textContent
    expect(stat('events')).toBe('2')
    expect(screen.getByText('orders · 20 tickets')).toBeInTheDocument()
    expect(stat('need a look')).toBe('0')
    expect(screen.getByRole('button', { name: /New event/ })).toBeInTheDocument()
  })

  it('groups the events by where they are, and says what wants doing', async () => {
    state.events = [
      summary({ id: 'e-past', slug: 'past', title: 'Last Month', first_starts_at: daysOn(-30), last_ends_at: daysOn(-30), awaiting: 0 }),
      summary({ id: 'e-cancelled', slug: 'off', title: 'Called Off', status: 'closed', cancelled_at: daysOn(-1), awaiting: 0, owed: 2 }),
      summary({ id: 'e-closed', slug: 'closed', title: 'Closed Early', status: 'closed', awaiting: 0 }),
      summary({ id: 'e-later', slug: 'later', title: 'Later On', first_starts_at: daysOn(60), last_ends_at: daysOn(60), awaiting: 3, reported: 1 }),
      summary({}),
      summary({ id: 'e2', slug: 'youth-night', title: 'Youth Night', status: 'draft', orders: 0, tickets: 0, expected_pence: 0, received_pence: 0, awaiting: 0, first_starts_at: null, last_ends_at: null }),
    ]
    show()
    await screen.findByRole('listitem', { name: 'Youth Night' })
    const names = (group: string) => within(screen.getByRole('list', { name: group })).getAllByRole('listitem').map((l) => l.getAttribute('aria-label'))
    // The live ones soonest first; the rest as they came.
    expect(names('Taking registrations')).toEqual(['Pastors & Leaders 2026', 'Later On'])
    expect(names('Drafts')).toEqual(['Youth Night'])
    expect(names('Closed or past')).toEqual(['Last Month', 'Closed Early'])
    expect(within(screen.getByRole('listitem', { name: 'Last Month' })).getByText('Past')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Closed Early' })).getByText('Closed')).toBeInTheDocument()
    expect(names('Cancelled')).toEqual(['Called Off'])
    const later = screen.getByRole('listitem', { name: 'Later On' })
    expect(within(later).getByText('1 receipt to check')).toBeInTheDocument()
    expect(within(later).getByText('2 not paid yet')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Called Off' })).getByText('2 refunds owed')).toBeInTheDocument()
    // One receipt and two refunds: three things to look at.
    expect(screen.getByText('need a look').parentElement!.querySelector('.text-numeral')!.textContent).toBe('3')
  })

  it('puts a published event whose last date has passed with the closed ones', () => {
    const now = new Date('2026-11-03T12:00:00Z')
    const groups = groupEvents(
      [
        summary({ id: 'a', first_starts_at: '2026-11-01T10:00:00Z', last_ends_at: '2026-11-01T12:00:00Z' }),
        summary({ id: 'b', first_starts_at: '2026-11-20T10:00:00Z', last_ends_at: '2026-11-20T12:00:00Z' }),
      ],
      now,
    )
    expect(groups.map((g) => [g.title, g.events.map((e) => e.id)])).toEqual([
      ['Taking registrations', ['b']],
      ['Closed or past', ['a']],
    ])
  })

  it('says how long people’s details are kept', async () => {
    show()
    expect(await screen.findByText(/blanked 90 days after its last date/)).toBeInTheDocument()
  })

  it('says what to do when there is nothing yet', async () => {
    state.events = []
    show()
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument()
  })
})
