import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegisterPage } from './RegisterPage'
import type { PublicEvent } from '../lib/registrations'

/*
 * An event's public page (0244): what it is and when, the tickets with how
 * many are left, the form, the sum — and then their ticket. Nobody signs in.
 */

const state = vi.hoisted(() => ({
  event: null as unknown,
  promo: { ok: false } as unknown,
  registered: [] as unknown[],
  mailed: [] as string[],
  resent: [] as unknown[],
  resendAnswer: { ok: true, sent: true } as unknown,
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false, session: null }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://signed/logo.png' }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public/${path}` } }),
      }),
    },
  },
}))
vi.mock('../components/PlaceMap', () => ({
  PlaceMap: ({ lat, lng }: { lat: number; lng: number }) => <p>map at {lat.toFixed(2)},{lng.toFixed(2)}</p>,
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchPublicEvent: () => Promise.resolve(state.event),
  checkPromoCode: () => Promise.resolve(state.promo),
  registerForEvent: (slug: string, order: unknown) => {
    state.registered.push({ slug, order })
    return Promise.resolve('ABCDEFGHJKMN')
  },
  sendTicketEmail: (code: string) => {
    state.mailed.push(code)
    return Promise.resolve({ ok: true, sent: true })
  },
  resendTickets: (slug: string, email: string) => {
    state.resent.push([slug, email])
    return Promise.resolve(state.resendAnswer)
  },
}))

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const event = (over: Partial<PublicEvent> = {}): PublicEvent => ({
  id: 'e1',
  slug: 'pastors-2026',
  title: 'Pastors & Leaders 2026',
  description: 'Two evenings. Details at https://example.org/plc',
  image_path: null,
  status: 'published',
  date_mode: 'all',
  location: { name: 'Church Hall', address: '12 High Street\nReading', latitude: 51.45, longitude: -0.97 },
  opens_at: null,
  closes_at: null,
  open: true,
  closed_reason: null,
  min_per_order: 1,
  max_per_order: 4,
  allow_pay_at_reception: true,
  payment_note: null,
  dates: [{ id: 'd1', starts_at: at(2026, 11, 21, 18, 30), ends_at: at(2026, 11, 21, 21, 0), label: null, open: true }],
  ticket_types: [
    { id: 't-std', name: 'Standard', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: 10, remaining: 3, remaining_by_date: {} },
    { id: 't-lunch', name: 'With lunch', description: 'Includes lunch', kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: null, remaining: null, remaining_by_date: {} },
  ],
  logo_path: null,
  ...over,
})

function TicketStub() {
  const { code } = useParams()
  return <p>ticket page {code}</p>
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/register/pastors-2026']}>
        <Routes>
          <Route path="/register/:slug" element={<RegisterPage />} />
          <Route path="/ticket/:code" element={<TicketStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const fillWho = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByRole('textbox', { name: 'Your name' }), 'Ama Owusu')
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ama@example.org')
  // A GB number by default, kept as its international form. (07700 900xxx is
  // the drama range, which the phone library rightly refuses.)
  await user.type(screen.getByRole('textbox', { name: 'Phone' }), '07911 123456')
}

beforeEach(() => {
  state.event = event()
  state.promo = { ok: false }
  state.registered = []
  state.mailed = []
  state.resent = []
  state.resendAnswer = { ok: true, sent: true }
})

describe('the public register page', () => {
  it('says what, when, where and what is left, with a way to get there', async () => {
    show()
    expect(await screen.findByRole('heading', { level: 1, name: 'Pastors & Leaders 2026' })).toBeInTheDocument()
    expect(screen.getByText('Church Hall')).toBeInTheDocument()
    expect(screen.getByText('map at 51.45,-0.97')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open directions/ })).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
    expect(screen.getByRole('link', { name: /example\.org\/plc/ })).toHaveAttribute('href', 'https://example.org/plc')
    // The paid type has no limit, so there is no number to show.
    expect(screen.queryByText(/tickets left/)).toBeNull()
    expect(within(screen.getByRole('listitem', { name: 'Standard' })).getByText(/3 left/)).toBeInTheDocument()
  })

  it('counts what is left when every type has a limit, and says sold out', async () => {
    const e = event()
    e.ticket_types[1] = { ...e.ticket_types[1], quantity: 20, remaining: 2 }
    state.event = e
    show()
    expect(await screen.findByText('5 tickets left')).toBeInTheDocument()
  })

  it('is sold out when nothing is left of any type', async () => {
    const e = event()
    e.ticket_types = [{ ...e.ticket_types[0], remaining: 0 }]
    state.event = e
    const user = show()
    expect(await screen.findByText('Sold out')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'One more Standard' })).toBeDisabled()
    await fillWho(user)
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled()
  })

  it('takes an order, names and all, and goes to the ticket', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'One more Standard' }))
    await user.click(screen.getByRole('button', { name: 'One more Standard' }))
    await user.type(screen.getByRole('textbox', { name: 'Standard 2 name' }), 'Kofi Owusu')
    await fillWho(user)
    expect(screen.getByText('2 tickets')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Register' }))

    expect(await screen.findByText('ticket page ABCDEFGHJKMN')).toBeInTheDocument()
    // The ticket goes by email too, without anything waiting on it.
    expect(state.mailed).toEqual(['ABCDEFGHJKMN'])
    expect(state.registered).toEqual([
      {
        slug: 'pastors-2026',
        order: {
          name: 'Ama Owusu',
          email: 'ama@example.org',
          phone: '+447911123456',
          date_id: null,
          promo_code: '',
          lines: [{ ticket_type_id: 't-std', quantity: 2, attendee_names: ['', 'Kofi Owusu'], donation_pence: undefined }],
          website: '',
        },
      },
    ])
  })

  it('prices the order, with a promo code, before anything is sent', async () => {
    state.promo = { ok: true, code: 'EARLY', kind: 'percent', value: 10, ticket_type_ids: [] }
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    expect(screen.getByRole('button', { name: 'Register · £20.00' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /Promo code/ }), 'early')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('10% off')).toBeInTheDocument()
    expect(screen.getByText('−£2.00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register · £18.00' })).toBeInTheDocument()

    await fillWho(user)
    await user.click(screen.getByRole('button', { name: 'Register · £18.00' }))
    await waitFor(() => expect(state.registered).toHaveLength(1))
    expect(state.registered[0]).toMatchObject({ order: { promo_code: 'EARLY', lines: [{ ticket_type_id: 't-lunch', quantity: 1 }] } })
  })

  it('keeps an order within what is left and what one order may hold', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    const more = screen.getByRole('button', { name: 'One more Standard' })
    await user.click(more)
    await user.click(more)
    await user.click(more)
    expect(more).toBeDisabled()
    // Three Standard and one With lunch fill an order of four.
    await user.click(screen.getByRole('button', { name: 'One more With lunch' }))
    expect(screen.getByRole('button', { name: 'One more With lunch' })).toBeDisabled()
    expect(screen.getByText('4 tickets')).toBeInTheDocument()
  })

  it('asks which date when people pick one, and sends it', async () => {
    const e = event({
      date_mode: 'choose',
      dates: [
        { id: 'd1', starts_at: at(2026, 11, 21, 18, 30), ends_at: null, label: 'Friday', open: true },
        { id: 'd2', starts_at: at(2026, 11, 22, 18, 30), ends_at: null, label: 'Saturday', open: true },
      ],
    })
    state.event = e
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    const dates = screen.getByRole('radiogroup', { name: 'Which date' })
    await user.click(within(dates).getByRole('radio', { name: /Saturday/ }))
    await user.click(screen.getByRole('button', { name: 'One more Standard' }))
    await fillWho(user)
    await user.click(screen.getByRole('button', { name: 'Register' }))
    await waitFor(() => expect(state.registered).toHaveLength(1))
    expect(state.registered[0]).toMatchObject({ order: { date_id: 'd2' } })
  })

  it('says when registration is not open, and shows no form', async () => {
    state.event = event({ open: false, closed_reason: 'not_yet', opens_at: at(2026, 11, 10, 9, 0) })
    show()
    expect(await screen.findByText(/^Registration opens /)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Register' })).toBeNull()
  })

  it('sends a lost ticket to the address that registered, and says the same whatever it found', async () => {
    const user = show()
    await screen.findByRole('heading', { level: 1 })
    await user.click(screen.getByRole('button', { name: 'Get your ticket again' }))
    const form = screen.getByRole('form', { name: 'Get your ticket again' })
    await user.type(within(form).getByRole('textbox', { name: 'Email' }), 'ama@example.org')
    await user.click(within(form).getByRole('button', { name: 'Send my ticket' }))
    expect(await within(form).findByRole('status')).toHaveTextContent(/If that address has a registration for this event/)
    expect(state.resent).toEqual([['pastors-2026', 'ama@example.org']])

    state.resendAnswer = { ok: false, reason: 'not configured' }
    await user.click(within(form).getByRole('button', { name: 'Send my ticket' }))
    expect(await within(form).findByText(/Tickets cannot be emailed just now/)).toBeInTheDocument()
  })

  it('offers the lost-ticket form even when registration has closed', async () => {
    state.event = event({ open: false, closed_reason: 'closed' })
    show()
    expect(await screen.findByText('Registration has closed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Get your ticket again' })).toBeInTheDocument()
  })

  it('places the picture by its focal point (0248)', async () => {
    state.event = event({ image_path: 'events/x.jpg', image_focus: { x: 20, y: 80 } })
    show()
    await screen.findByRole('textbox', { name: 'Your name' })
    expect(document.querySelector('img[src="https://public/events/x.jpg"]')).toHaveStyle({ objectPosition: '20% 80%' })
  })

  it('says so when the link leads nowhere', async () => {
    state.event = null
    show()
    expect(await screen.findByRole('heading', { name: 'No such event' })).toBeInTheDocument()
  })
})
