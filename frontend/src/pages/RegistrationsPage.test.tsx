import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationsPage } from './RegistrationsPage'
import type { EventSummary } from '../lib/registrations'

/*
 * Registrations (0244): every event people can sign up for, how each
 * stands, and its link ready to copy.
 */

const state = vi.hoisted(() => ({ events: [] as unknown[] }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
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
  awaiting: 3,
  first_starts_at: '2026-11-21T18:30:00Z',
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
  state.events = [summary({}), summary({ id: 'e2', slug: 'youth-night', title: 'Youth Night', status: 'draft', orders: 0, tickets: 0, expected_pence: 0, received_pence: 0, awaiting: 0, first_starts_at: null })]
})

describe('the Registrations page', () => {
  it('lists every event with where it stands and its link', async () => {
    const user = show()
    const card = await screen.findByRole('listitem', { name: 'Pastors & Leaders 2026' })
    expect(within(card).getByText('Taking registrations')).toBeInTheDocument()
    expect(within(card).getByText('3 awaiting payment')).toBeInTheDocument()
    expect(within(card).getByText('12 orders · £300.00 of £400.00 received')).toBeInTheDocument()
    expect(within(card).getByText('https://rim-church-app.vercel.app/register/pastors-2026')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Copy link' }))
    expect(await navigator.clipboard.readText()).toBe('https://rim-church-app.vercel.app/register/pastors-2026')
    expect(within(card).getByRole('button', { name: 'Copied' })).toBeInTheDocument()

    const draft = screen.getByRole('listitem', { name: 'Youth Night' })
    expect(within(draft).getByText('Draft')).toBeInTheDocument()
    expect(within(draft).getByText(/No date yet/)).toBeInTheDocument()
  })

  it('adds the events up, and leads to a new one', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Youth Night' })
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('events')).toBeInTheDocument()
    expect(screen.getByText('orders · 20 tickets')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New event/ })).toBeInTheDocument()
  })

  it('says what to do when there is nothing yet', async () => {
    state.events = []
    show()
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument()
  })
})
