import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DoorPage } from './DoorPage'
import type { EventSummary, OrderRow, RegistrationEventFull } from '../lib/registrations'
import { resetUndoForTests } from '../lib/registrationUndo'

/*
 * Reception (0247): today's event comes up on its own; a scanned ticket is
 * checked in or paid there and then; anybody can be found by name; and a
 * walk-in is registered, paid, checked in and sent their ticket.
 */

const state = vi.hoisted(() => ({
  events: [] as unknown[],
  full: null as unknown,
  orders: [] as unknown[],
  marked: [] as unknown[],
  walkIns: [] as unknown[],
  notified: [] as unknown[],
  mailed: [] as string[],
  // What the page said, with whatever it offered to take back (0281).
  toasts: [] as { text: string; tone?: string; action?: { label: string; run: () => void } }[],
  undone: [] as string[],
  undoRefused: null as null | { message: string },
}))
const cam = vi.hoisted(() => ({ onText: null as null | ((text: string) => void) }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ settled: true, canOpen: () => true, standing: 'church' }) }))
const rights = vi.hoisted(() => ({ now: { office: true, door: true, edit: true, approve: true, takePayment: true, refund: true, cancel: true, delete: true, checkIn: true, walkIn: true } as Record<string, boolean> }))
vi.mock('../lib/registrationRights', async (original) => ({
  ...(await original<typeof import('../lib/registrationRights')>()),
  useRegistrationRights: () => rights.now,
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/toast', () => ({
  showToast: (text: string, tone?: string, _ms?: number, action?: { label: string; run: () => void }) => {
    state.toasts.push({ text, tone, action })
    return state.toasts.length
  },
  dismissToast: () => undefined,
}))
// The two things the page asks of the database itself: put a registration
// back as it was, and which registration a walk-in's code belongs to.
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: { p_id: string }) => {
      // The page asks whether Reception is locked before it draws anything (0288): here it never is.
      if (fn === 'reception_lock_state') return Promise.resolve({ data: { locked: false, note: null, changed_at: null, changed_by: null }, error: null })
      if (fn !== 'registration_order_undo') throw new Error(`unexpected rpc ${fn}`)
      state.undone.push(args.p_id)
      return Promise.resolve(state.undoRefused ? { data: null, error: state.undoRefused } : { data: 'change', error: null })
    },
    from: () => ({ select: () => ({ eq: (_c: string, code: string) => ({ maybeSingle: () => Promise.resolve({ data: { id: `order-of-${code}` }, error: null }) }) }) }),
  },
}))
vi.mock('../lib/qrCamera', () => ({
  // Hears only while the camera is meant to be on, as the real one does.
  useQrCamera: (_ref: unknown, onText: (text: string) => void, active = true) => {
    cam.onText = active ? onText : null
    return active ? 'scanning' : 'starting'
  },
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
  fetchRegistrationEvents: () => Promise.resolve(state.events),
  fetchRegistrationEvent: () => Promise.resolve(state.full),
  fetchRegistrationOrders: () => Promise.resolve(state.orders),
  markOrder: (id: string, action: string) => {
    state.marked.push([id, action])
    return Promise.resolve()
  },
  payAndCheckIn: (id: string) => {
    state.marked.push([id, 'received_and_check_in'])
    return Promise.resolve()
  },
  walkIn: (eventId: string, order: unknown) => {
    state.walkIns.push([eventId, order])
    return Promise.resolve('WALKIN123456')
  },
  notifyPayment: (kind: string, code: string) => {
    state.notified.push([kind, code])
    return Promise.resolve({ ok: true, sent: true })
  },
  sendTicketEmail: (code: string) => {
    state.mailed.push(code)
    return Promise.resolve({ ok: true, sent: true })
  },
}))

const today = (h: number, min: number) => new Date(new Date().setHours(h, min, 0, 0)).toISOString()
const daysOn = (n: number, h: number) => new Date(new Date().setHours(h, 0, 0, 0) + n * 86400000).toISOString()
const scan = (text: string) => act(() => cam.onText!(text))

const summary = (over: Partial<EventSummary>): EventSummary => ({
  id: 'e1',
  slug: 'plc-2026',
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
  orders: 3,
  tickets: 6,
  expected_pence: 5600,
  received_pence: 2000,
  awaiting: 1,
  reported: 0,
  owed: 0,
  first_starts_at: today(18, 30),
  last_ends_at: today(21, 0),
  ...over,
})

const full = (over: Partial<RegistrationEventFull> = {}): RegistrationEventFull => ({
  event: summary({}),
  dates: [{ id: 'd1', event_id: 'e1', starts_at: today(18, 30), ends_at: today(21, 0), label: null, sort_order: 0, diary_event_id: null }],
  ticketTypes: [
    { id: 't1', event_id: 'e1', name: 'With lunch', description: null, kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: 40, sort_order: 0 },
    { id: 't2', event_id: 'e1', name: 'Standard', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: null, sort_order: 1 },
  ],
  promoCodes: [],
  ...over,
})

const order = (over: Partial<OrderRow>): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: '07911 123456',
  quantity: 2,
  subtotal_pence: 4000,
  discount_pence: 400,
  total_pence: 3600,
  promo_code: 'EARLY',
  payment_status: 'awaiting',
  payment_method: null,
  status: 'confirmed',
  checked_in_at: null,
  notes: null,
  anonymised_at: null,
  created_at: '2026-11-02T10:00:00Z',
  tickets: [
    { ticket_type_id: 't1', attendee_name: 'Ama Owusu', unit_price_pence: 2000 },
    { ticket_type_id: 't1', attendee_name: 'Kofi Owusu', unit_price_pence: 2000 },
  ],
  ...over,
})
const orders = (): OrderRow[] => [
  order({}),
  order({ id: 'o-ben', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', email: 'ben@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, payment_status: 'received', payment_method: 'bank', checked_in_at: today(18, 40), tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
  order({ id: 'o-grace', code: 'CDEFGHJKMNPQ', name: 'Grace Mensah', email: null, phone: null, quantity: 3, subtotal_pence: 0, discount_pence: 0, total_pence: 0, promo_code: null, payment_status: 'not_needed', source: 'walk_in', tickets: [1, 2, 3].map(() => ({ ticket_type_id: 't2', attendee_name: null, unit_price_pence: 0 })) }),
  order({ id: 'o-sam', code: 'EFGHJKMNPQRS', name: 'Sam Paul', email: 'sam@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, payment_status: 'received', tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
]

function show(path = '/door') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/door" element={<DoorPage />} />
          <Route path="/registrations/:id" element={<p>the event's page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const stat = (unit: string) => screen.getByText(unit).parentElement!.querySelector('.text-numeral')!.textContent

beforeEach(() => {
  rights.now = { office: true, door: true, edit: true, approve: true, takePayment: true, refund: true, cancel: true, delete: true, checkIn: true, walkIn: true }
  cam.onText = null
  state.events = [
    summary({ id: 'e-next', slug: 'youth-night', title: 'Youth Night', first_starts_at: daysOn(6, 19), last_ends_at: daysOn(6, 21) }),
    summary({}),
    summary({ id: 'e-past', slug: 'last-week', title: 'Last Week', status: 'closed', first_starts_at: daysOn(-7, 19), last_ends_at: daysOn(-7, 21) }),
  ]
  state.full = full()
  state.orders = orders()
  state.marked = []
  state.walkIns = []
  state.notified = []
  state.mailed = []
  state.toasts = []
  state.undone = []
  state.undoRefused = null
  // Nothing remembered from the test before, and no ten seconds to wait for an email.
  resetUndoForTests(0)
})

describe('Reception', () => {
  it('picks today’s event, shows how the door stands, and checks a paid ticket in on sight', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })).toBeInTheDocument()
    // Ben's ticket is here; six tickets live; Ama still owes.
    expect(stat('here')).toBe('1')
    expect(stat('tickets')).toBe('7')
    expect(stat('still to pay')).toBe('1')
    expect(screen.getByRole('link', { name: "The event's page" })).toHaveAttribute('href', '/registrations/e1')
    // The camera waits for a tap: opening Reception does not start it.
    expect(cam.onText).toBeNull()
    expect(document.querySelector('video')).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Start scanning/ }))
    expect(cam.onText).not.toBeNull()
    scan('https://rim-church-app.vercel.app/ticket/EFGHJKMNPQRS')
    await waitFor(() => expect(state.marked).toEqual([['o-sam', 'check_in']]))
    expect(within(screen.getByRole('region', { name: 'Ticket found' })).getByText('Checked in')).toBeInTheDocument()
    // Nothing was owed, so nobody is emailed about a payment.
    expect(state.notified).toEqual([])
  })

  it('holds up a ticket that still owes, takes the money at the door, and confirms the ticket by email', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('button', { name: /Start scanning/ }))
    scan('https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
    const card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText('£36.00 still to pay.')).toBeInTheDocument()
    expect(state.marked).toEqual([])
    await user.click(within(card).getByRole('button', { name: 'Paid now, check in' }))
    // One call, so it is one thing to undo (0281).
    await waitFor(() => expect(state.marked).toEqual([['o1', 'received_and_check_in']]))
    await waitFor(() => expect(state.notified).toEqual([['paid', 'ABCDEFGHJKMN']]))
  })

  it('finds anybody by name, checks them in or undoes it, and takes a payment from somebody already in', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    const list = screen.getByRole('list', { name: 'Registrations' })
    expect(within(list).getAllByRole('listitem').map((l) => l.getAttribute('aria-label'))).toEqual(['Ama Owusu', 'Ben Joseph', 'Grace Mensah', 'Sam Paul'])
    await user.type(screen.getByRole('searchbox', { name: 'Find a registration' }), 'grace')
    const grace = screen.getByRole('listitem', { name: 'Grace Mensah' })
    expect(screen.queryByRole('listitem', { name: 'Ama Owusu' })).toBeNull()
    await user.click(within(grace).getByRole('button', { name: 'Check in' }))
    await waitFor(() => expect(state.marked).toEqual([['o-grace', 'check_in']]))

    await user.clear(screen.getByRole('searchbox', { name: 'Find a registration' }))
    const ben = screen.getByRole('listitem', { name: 'Ben Joseph' })
    expect(within(ben).getByText(/^Checked in/)).toBeInTheDocument()
    await user.click(within(ben).getByRole('button', { name: 'Undo check-in' }))
    await waitFor(() => expect(state.marked).toContainEqual(['o-ben', 'undo_check_in']))

    // Ama is in already but still owes: the money alone, then.
    state.orders = [order({ checked_in_at: today(18, 50) })]
    await user.type(screen.getByRole('searchbox', { name: 'Find a registration' }), 'ama')
    const ama = screen.getByRole('listitem', { name: 'Ama Owusu' })
    expect(within(ama).getByText('£36.00 still to pay.')).toBeInTheDocument()
    expect(within(ama).getByRole('button', { name: 'Paid now, check in' })).toBeInTheDocument()
  })

  it('counts only today’s check-ins as here, and offers yesterday’s a check-in again (0254)', async () => {
    state.orders = [
      order({ id: 'o-ben', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', quantity: 1, total_pence: 2000, promo_code: null, payment_status: 'received', checked_in_at: daysOn(-1, 18), tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
      order({ id: 'o-sam', code: 'EFGHJKMNPQRS', name: 'Sam Paul', quantity: 1, total_pence: 2000, promo_code: null, payment_status: 'received', checked_in_at: today(18, 10), tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
    ]
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    expect(stat('here')).toBe('1')
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    const ben = screen.getByRole('listitem', { name: 'Ben Joseph' })
    expect(within(ben).getByText(/not yet today$/)).toBeInTheDocument()
    await user.click(within(ben).getByRole('button', { name: 'Check in' }))
    await waitFor(() => expect(state.marked).toEqual([['o-ben', 'check_in']]))
    const sam = screen.getByRole('listitem', { name: 'Sam Paul' })
    expect(within(sam).queryByRole('button', { name: 'Check in' })).toBeNull()
    expect(within(sam).getByRole('button', { name: 'Undo check-in' })).toBeInTheDocument()
  })

  it('registers a walk-in — paid, checked in — and sends their ticket when they give an address', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Walk-in' }))
    const form = screen.getByRole('form', { name: 'Walk-in' })
    await user.click(within(form).getByRole('button', { name: 'Register' }))
    expect(within(form).getByRole('alert')).toHaveTextContent(/Their name/)
    expect(within(form).getByRole('alert')).toHaveTextContent(/At least one ticket/)
    expect(state.walkIns).toEqual([])

    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Joel Skaria')
    await user.type(within(form).getByRole('textbox', { name: 'Phone (optional)' }), '07911 123456')
    await user.type(within(form).getByRole('textbox', { name: 'Email (optional)' }), 'joel@example.org')
    await user.click(within(form).getByRole('button', { name: 'One more With lunch' }))
    await user.click(within(form).getByRole('button', { name: 'One more Standard' }))
    expect(within(form).getByRole('checkbox', { name: /Paid now · £20.00/ })).toBeChecked()
    expect(within(form).getByRole('checkbox', { name: /Here now/ })).toBeChecked()
    await user.click(within(form).getByRole('button', { name: 'Register' }))
    await waitFor(() => expect(state.walkIns).toHaveLength(1))
    expect(state.walkIns[0]).toEqual([
      'e1',
      {
        name: 'Joel Skaria',
        email: 'joel@example.org',
        phone: '+447911123456',
        date_id: null,
        lines: [
          { ticket_type_id: 't1', quantity: 1, attendee_names: [] },
          { ticket_type_id: 't2', quantity: 1, attendee_names: [] },
        ],
        paid: true,
        checked_in: true,
      },
    ])
    const done = await screen.findByRole('region', { name: 'Registered' })
    expect(within(done).getByText('WALKIN123456')).toBeInTheDocument()
    expect(within(done).getByText(/on its way to joel@example.org/)).toBeInTheDocument()
    await waitFor(() => expect(state.mailed).toEqual(['WALKIN123456']))
    await user.click(within(done).getByRole('button', { name: 'Another walk-in' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('')
  })

  it('registers a free walk-in with no address, and says no ticket was sent', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Walk-in' }))
    const form = screen.getByRole('form', { name: 'Walk-in' })
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Walk In')
    await user.click(within(form).getByRole('button', { name: 'One more Standard' }))
    expect(within(form).queryByRole('checkbox', { name: /Paid now/ })).toBeNull()
    await user.click(within(form).getByRole('checkbox', { name: /Here now/ }))
    await user.click(within(form).getByRole('button', { name: 'Register' }))
    await waitFor(() => expect(state.walkIns).toHaveLength(1))
    expect(state.walkIns[0]).toMatchObject(['e1', { name: 'Walk In', email: '', phone: '', paid: false, checked_in: false }])
    const done = await screen.findByRole('region', { name: 'Registered' })
    expect(within(done).getByText(/No email address, so no ticket was sent/)).toBeInTheDocument()
    expect(state.mailed).toEqual([])
  })

  /*
   * Undo (0281): a door is where a thumb lands on the wrong row. Every
   * press says who it was done to, with Undo on it.
   */
  it('names who was checked in, with Undo that takes exactly that back', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    await user.click(within(screen.getByRole('listitem', { name: 'Grace Mensah' })).getByRole('button', { name: 'Check in' }))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Checked in Grace Mensah']))
    await user.click(within(screen.getByRole('listitem', { name: 'Ben Joseph' })).getByRole('button', { name: 'Undo check-in' }))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Checked in Grace Mensah', 'Check-in undone for Ben Joseph']))

    // Two people, two offers; each takes back its own.
    state.toasts[0].action!.run()
    await waitFor(() => expect(state.undone).toEqual(['o-grace']))
    state.toasts[1].action!.run()
    await waitFor(() => expect(state.undone).toEqual(['o-grace', 'o-ben']))
    await waitFor(() => expect(state.toasts.filter((t) => t.text === 'Undone')).toHaveLength(2))
  })

  it('takes money and lets them in as one thing to undo, and an undone payment never emails them', async () => {
    // An offer long enough to press: the email is waiting on it.
    resetUndoForTests(60_000)
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    await user.click(within(screen.getByRole('listitem', { name: 'Ama Owusu' })).getByRole('button', { name: 'Paid now, check in' }))
    await waitFor(() => expect(state.marked).toEqual([['o1', 'received_and_check_in']]))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Received, and checked in Ama Owusu']))
    expect(state.notified).toEqual([])
    state.toasts[0].action!.run()
    await waitFor(() => expect(state.undone).toEqual(['o1']))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Undone' }))
    window.dispatchEvent(new Event('pagehide'))
    expect(state.notified).toEqual([])
  })

  it('undoes a walk-in: the registration goes, its ticket is never sent, and the form is ready again', async () => {
    resetUndoForTests(60_000)
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Walk-in' }))
    const form = screen.getByRole('form', { name: 'Walk-in' })
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Joel Skaria')
    await user.type(within(form).getByRole('textbox', { name: 'Email (optional)' }), 'joel@example.org')
    await user.click(within(form).getByRole('button', { name: 'One more With lunch' }))
    await user.click(within(form).getByRole('button', { name: 'Register' }))
    await screen.findByRole('region', { name: 'Registered' })
    expect(state.toasts.map((t) => t.text)).toEqual(['Registered Joel Skaria, and checked in'])
    expect(state.mailed).toEqual([])

    state.toasts[0].action!.run()
    // Found by its code, then put back — which for a walk-in is gone.
    await waitFor(() => expect(state.undone).toEqual(['order-of-WALKIN123456']))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Registered' })).toBeNull())
    expect(screen.getByRole('form', { name: 'Walk-in' })).toBeInTheDocument()
    window.dispatchEvent(new Event('pagehide'))
    expect(state.mailed).toEqual([])
  })

  it('keeps the offer on the row once the toast has gone, for the registration it was done to', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    // Nothing done yet: no row offers anything to take back.
    expect(screen.queryByRole('button', { name: /^Undo: / })).toBeNull()
    const ama = screen.getByRole('listitem', { name: 'Ama Owusu' })
    await user.click(within(ama).getByRole('button', { name: 'Paid now, check in' }))
    await waitFor(() => expect(within(ama).getByText('Just now: Received, and checked in Ama Owusu.')).toBeInTheDocument())
    // On hers and nobody else's.
    expect(screen.getAllByRole('button', { name: /^Undo: / })).toHaveLength(1)
    await user.click(within(ama).getByRole('button', { name: 'Undo: Received, and checked in Ama Owusu' }))
    await waitFor(() => expect(state.undone).toEqual(['o1']))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Undo: / })).toBeNull())
    expect(state.toasts.at(-1)).toMatchObject({ text: 'Undone' })
  })

  it('leaves the offer on the row when the undo is refused, and says why', async () => {
    state.undoRefused = { message: 'This registration has changed since. Use the menu to put it right.' }
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    const grace = screen.getByRole('listitem', { name: 'Grace Mensah' })
    await user.click(within(grace).getByRole('button', { name: 'Check in' }))
    await user.click(await within(grace).findByRole('button', { name: 'Undo: Checked in Grace Mensah' }))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Could not undo that.', tone: 'error' }))
    expect(within(grace).getByRole('button', { name: 'Undo: Checked in Grace Mensah' })).toBeInTheDocument()
  })

  it('keeps Undo on the walk-in’s card for as long as it is up', async () => {
    resetUndoForTests(60_000)
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Walk-in' }))
    const form = screen.getByRole('form', { name: 'Walk-in' })
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Joel Skaria')
    await user.type(within(form).getByRole('textbox', { name: 'Email (optional)' }), 'joel@example.org')
    await user.click(within(form).getByRole('button', { name: 'One more Standard' }))
    await user.click(within(form).getByRole('button', { name: 'Register' }))
    const card = await screen.findByRole('region', { name: 'Registered' })
    await user.click(within(card).getByRole('button', { name: 'Undo this walk-in' }))
    await waitFor(() => expect(state.undone).toEqual(['order-of-WALKIN123456']))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Registered' })).toBeNull())
    // The form is there again as it was typed, to put right; and no ticket ever went.
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Joel Skaria')
    window.dispatchEvent(new Event('pagehide'))
    expect(state.mailed).toEqual([])
    // The toast's Undo, pressed after, asks nothing more.
    state.toasts[0].action!.run()
    await Promise.resolve()
    expect(state.undone).toEqual(['order-of-WALKIN123456'])
  })

  it('starts the camera only on a tap, and stops it again', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    // The typed code works with the camera off.
    expect(screen.getByRole('textbox', { name: 'Ticket code' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Start scanning/ }))
    expect(document.querySelector('video')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Stop camera' }))
    expect(cam.onText).toBeNull()
    expect(screen.getByRole('button', { name: /Start scanning/ })).toBeInTheDocument()
  })

  it('lets the door pick another event that is on, and takes one from the address', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    // Today's and the one next week; last week's is over.
    await user.click(screen.getByRole('combobox', { name: 'Event' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringContaining('Pastors & Leaders 2026'), expect.stringContaining('Youth Night')])
    state.full = full({ event: summary({ id: 'e-next', title: 'Youth Night' }) })
    await user.click(screen.getByRole('option', { name: /Youth Night/ }))
    expect(await screen.findByRole('heading', { name: 'Youth Night' })).toBeInTheDocument()
  })

  it('opens on the event the link names', async () => {
    state.full = full({ event: summary({ id: 'e-next', title: 'Youth Night' }) })
    show('/door?event=e-next')
    expect(await screen.findByRole('heading', { name: 'Youth Night' })).toBeInTheDocument()
  })

  it('says why an order is free when a promo code made it so', async () => {
    state.orders = [order({ total_pence: 0, discount_pence: 4000, payment_status: 'not_needed', promo_code: 'REHOBOTH26' })]
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    expect(within(screen.getByRole('listitem', { name: 'Ama Owusu' })).getByText('Free with code REHOBOTH26')).toBeInTheDocument()
  })

  it('leaves a cancelled event off the door', async () => {
    state.events = [summary({ cancelled_at: '2026-11-04T10:00:00Z' })]
    show()
    expect(await screen.findByText(/No event today, and none coming up/)).toBeInTheDocument()
  })

  it('lets somebody who only checks people in do that, and nothing more (0251)', async () => {
    rights.now = { ...rights.now, takePayment: false, walkIn: false, approve: false, edit: false, refund: false, cancel: false, delete: false, office: false }
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    expect(screen.queryByRole('tab', { name: 'Walk-in' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /Start scanning/ }))
    scan('https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
    const card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText('£36.00 still to pay.')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: /Paid now/ })).toBeNull()
    // An unpaid one is not theirs to let in (0266): they are told where to send them.
    expect(within(card).queryByRole('button', { name: 'Check in' })).toBeNull()
    expect(within(card).getByText(/cannot be checked in until it is paid/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    const row = screen.getByRole('listitem', { name: 'Ama Owusu' })
    expect(within(row).queryByRole('button', { name: /Paid now/ })).toBeNull()
    expect(within(row).queryByRole('button', { name: 'Check in' })).toBeNull()
    expect(within(row).getByText(/Cannot be checked in until it is paid/)).toBeInTheDocument()
  })

  it('shows somebody here to look the list and the counts, and nothing to press (0267)', async () => {
    rights.now = { office: false, door: true, edit: false, approve: false, takePayment: false, refund: false, cancel: false, delete: false, checkIn: false, walkIn: false }
    state.orders = state.orders.map((o, i) => (i === 0 ? { ...(o as object), payment_status: 'received', payment_verified_at: '2026-11-20T08:00:00Z' } : o))
    show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    expect(screen.getByText(/You are here to look/)).toBeInTheDocument()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('button', { name: /Start scanning/ })).toBeNull()
    const row = screen.getByRole('listitem', { name: 'Ama Owusu' })
    expect(within(row).getByText('Verified payment')).toBeInTheDocument()
    expect(within(row).queryByRole('button')).toBeNull()
    for (const li of screen.getAllByRole('listitem')) expect(within(li).queryByRole('button')).toBeNull()
  })

  it('lets a walk-in be registered as still to pay by somebody who cannot take money', async () => {
    rights.now = { ...rights.now, takePayment: false, approve: false }
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Walk-in' }))
    const form = screen.getByRole('form', { name: 'Walk-in' })
    await user.type(within(form).getByRole('textbox', { name: 'Name' }), 'Joel Skaria')
    await user.click(within(form).getByRole('button', { name: 'One more With lunch' }))
    expect(within(form).queryByRole('checkbox', { name: /Paid now/ })).toBeNull()
    // Registered, but not let in while it owes (0266).
    expect(within(form).getByRole('checkbox', { name: /Here now/ })).toBeDisabled()
    expect(within(form).getByText(/cannot be checked in until it is paid/)).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Register' }))
    await waitFor(() => expect(state.walkIns).toHaveLength(1))
    expect(state.walkIns[0]).toMatchObject(['e1', { paid: false, checked_in: false }])
  })

  it('says so when nothing is on', async () => {
    state.events = [summary({ id: 'e-past', status: 'closed', first_starts_at: daysOn(-7, 19), last_ends_at: daysOn(-7, 21) }), summary({ id: 'e-draft', status: 'draft' })]
    show()
    expect(await screen.findByText(/No event today, and none coming up/)).toBeInTheDocument()
  })
})
