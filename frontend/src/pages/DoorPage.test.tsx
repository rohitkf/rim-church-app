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
  // What "Sort out problems" wrote (0312): notes, addresses, codes, and tickets sent once more.
  notes: [] as unknown[],
  emails: [] as unknown[],
  promos: [] as unknown[],
  again: [] as string[],
  opened: [] as string[],
}))
const cam = vi.hoisted(() => ({ onText: null as null | ((text: string) => void) }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: false, isSuperAdmin: false, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/usePageAccess', () => ({ usePageAccess: () => ({ settled: true, canOpen: () => true, standing: 'church' }) }))
const rights = vi.hoisted(() => ({ now: { office: true, door: true, edit: true, approve: true, takePayment: true, refund: true, cancel: true, delete: true, checkIn: true, walkIn: true } as Record<string, boolean> }))
vi.mock('../lib/registrationRights', async (original) => ({
  ...(await original<typeof import('../lib/registrationRights')>()),
  // The five words 0312 split out of the office's rights, as rightsFrom() derives them for somebody
  // without the door's "Sort out problems"; a test that means otherwise says so in rights.now.
  useRegistrationRights: () => {
    const r = rights.now
    return { fix: false, waive: r.approve, promo: r.approve, cancelOrder: r.cancel, note: r.office, ...r }
  },
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
  setOrderNotes: (id: string, notes: string) => {
    state.notes.push([id, notes])
    return Promise.resolve()
  },
  setOrderEmail: (id: string, email: string) => {
    state.emails.push([id, email])
    return Promise.resolve(true)
  },
  sendTicketAgain: (code: string) => {
    state.again.push(code)
    return Promise.resolve({ ok: true, sent: true })
  },
}))
vi.mock('../lib/promoLater', async (original) => ({
  ...(await original<typeof import('../lib/promoLater')>()),
  applyPromoToOrder: (id: string, code: string) => {
    state.promos.push([id, code])
    return Promise.resolve()
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
  waived_pence: 0,
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
  state.notes = []
  state.emails = []
  state.promos = []
  state.again = []
  state.opened = []
  window.open = ((url: string) => {
    state.opened.push(url)
    return null
  }) as typeof window.open
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
    // In tickets, like the two beside it: Ama's registration is two people.
    expect(stat('still to pay')).toBe('2')
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
    await user.click(within(card).getByRole('button', { name: 'Paid & check in all 2' }))
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
    // Three tickets on it, and a registration is checked in whole: the button says so.
    await user.click(within(grace).getByRole('button', { name: 'Check in all 3' }))
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
    expect(within(ama).getByRole('button', { name: 'Paid & check in all 2' })).toBeInTheDocument()
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
    await user.click(within(screen.getByRole('listitem', { name: 'Grace Mensah' })).getByRole('button', { name: 'Check in all 3' }))
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
    await user.click(within(screen.getByRole('listitem', { name: 'Ama Owusu' })).getByRole('button', { name: 'Paid & check in all 2' }))
    await waitFor(() => expect(state.marked).toEqual([['o1', 'received_and_check_in']]))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Marked as paid, and checked in Ama Owusu']))
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
    await user.click(within(ama).getByRole('button', { name: 'Paid & check in all 2' }))
    await waitFor(() => expect(within(ama).getByText('Just now: Marked as paid, and checked in Ama Owusu.')).toBeInTheDocument())
    // On hers and nobody else's.
    expect(screen.getAllByRole('button', { name: /^Undo: / })).toHaveLength(1)
    await user.click(within(ama).getByRole('button', { name: 'Undo: Marked as paid, and checked in Ama Owusu' }))
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
    await user.click(within(grace).getByRole('button', { name: 'Check in all 3' }))
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

  it('takes the money for somebody who is not at the door yet, with a button of its own', async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    const ama = screen.getByRole('listitem', { name: 'Ama Owusu' })
    const both = within(ama).getByRole('button', { name: 'Paid & check in all 2' })
    const money = within(ama).getByRole('button', { name: 'Mark as paid' })
    // Told apart by colour as well as by word: green lets them in, blue records their money.
    expect(both.className).toContain('accent-green')
    expect(money.className).toContain('accent-blue')
    await user.click(money)
    // The payment alone: nobody is checked in by it.
    await waitFor(() => expect(state.marked).toEqual([['o1', 'received']]))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Marked as paid: Ama Owusu']))
  })

  it('does not ask the door for money the account already has (0267)', async () => {
    state.orders = state.orders.map((o, i) => (i === 0 ? { ...(o as object), payment_status: 'reported', payment_verified_at: '2026-11-20T08:00:00Z' } : o)) as typeof state.orders
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    const ama = screen.getByRole('listitem', { name: 'Ama Owusu' })
    expect(within(ama).getByText('Verified payment')).toBeInTheDocument()
    expect(within(ama).queryByText(/still to pay/)).toBeNull()
    expect(within(ama).getByText(/£36\.00 has been seen in the account\. Nothing more to collect/)).toBeInTheDocument()
    expect(within(ama).getByRole('button', { name: 'Mark as paid' })).toBeInTheDocument()
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
    expect(within(card).queryByRole('button', { name: /Paid|paid/ })).toBeNull()
    // An unpaid one is not theirs to let in (0266): they are told where to send them.
    expect(within(card).queryByRole('button', { name: /^Check in/ })).toBeNull()
    expect(within(card).getByText(/cannot be checked in until it is paid/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    const row = screen.getByRole('listitem', { name: 'Ama Owusu' })
    expect(within(row).queryByRole('button', { name: /Paid|paid/ })).toBeNull()
    expect(within(row).queryByRole('button', { name: /^Check in/ })).toBeNull()
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

/*
 * What a door meets that is not a check-in, a payment or a walk-in (0312,
 * the Owner on the first day of a conference): a wrong address, a note,
 * a code they did not use, somebody to come in free, a registration
 * cancelled that should not have been. Each registration has a menu for
 * those, drawn from the office's own list and asked with the door's rights.
 */
describe('sorting out problems at Reception', () => {
  // Everything a door does, "Sort out problems" included, and nothing of the office's.
  const doorWithFix = { office: false, door: true, edit: false, approve: false, takePayment: true, refund: false, cancel: false, delete: false, checkIn: true, walkIn: true, verify: false, fix: true, email: true, note: true, promo: true, waive: true, cancelOrder: true }
  // The door as it was: check in, take a payment, a walk-in.
  const doorAsItWas = { ...doorWithFix, fix: false, email: false, note: false, promo: false, waive: false, cancelOrder: false }
  const find = async () => {
    const user = show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    await user.click(screen.getByRole('tab', { name: 'Find' }))
    return user
  }
  const menuOf = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(within(screen.getByRole('listitem', { name })).getByRole('button', { name: `Actions for ${name}` }))
    return screen.getByRole('menu')
  }
  const labels = (menu: HTMLElement) => within(menu).getAllByRole('menuitem').map((m) => m.textContent)

  it('gives whoever sorts out problems a menu on each registration: waive, a note, the address, cancel, their ticket', async () => {
    rights.now = doorWithFix
    const user = await find()
    // Ama owes: the money can be taken, or let go; the rest is there for whatever else is wrong.
    expect(labels(await menuOf(user, 'Ama Owusu'))).toEqual([
      expect.stringContaining('Mark as paid'),
      'Waive the payment',
      expect.stringContaining('Check in'),
      expect.stringContaining('Change email address'),
      'Add a note',
      'Cancel registration',
      expect.stringContaining('Open their ticket'),
    ])
    await user.click(screen.getByRole('menuitem', { name: 'Waive the payment' }))
    await waitFor(() => expect(state.marked).toEqual([['o1', 'waived']]))
    // Said, with Undo on it, like every other press at the door.
    expect(state.toasts.at(-1)).toMatchObject({ text: 'Payment waived: Ama Owusu', action: { label: 'Undo' } })
    // A waiver is not a payment: nobody is emailed "your ticket is confirmed".
    expect(state.notified).toEqual([])
  })

  it('puts a paid registration back to not paid, for a payment marked on the wrong row', async () => {
    rights.now = doorWithFix
    const user = await find()
    const menu = await menuOf(user, 'Sam Paul')
    expect(labels(menu)).toContainEqual(expect.stringContaining('Back to not paid'))
    await user.click(within(menu).getByRole('menuitem', { name: /Back to not paid/ }))
    await waitFor(() => expect(state.marked).toEqual([['o-sam', 'awaiting']]))
  })

  it('keeps a note, and corrects an address — the ticket goes again once the undo has passed', async () => {
    rights.now = doorWithFix
    const user = await find()
    await user.click(within(await menuOf(user, 'Ama Owusu')).getByRole('menuitem', { name: 'Add a note' }))
    const note = screen.getByRole('dialog', { name: 'A note on Ama Owusu’s registration' })
    await user.type(within(note).getByRole('textbox', { name: 'Note' }), 'Wheelchair space')
    await user.click(within(note).getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(state.notes).toEqual([['o1', 'Wheelchair space']]))
    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(within(await menuOf(user, 'Ama Owusu')).getByRole('menuitem', { name: /Change email address/ }))
    const dialog = screen.getByRole('dialog')
    const box = within(dialog).getByRole('textbox')
    await user.clear(box)
    await user.type(box, 'ama.owusu@example.org')
    await user.click(within(dialog).getByRole('button', { name: /Save|Change/ }))
    await waitFor(() => expect(state.emails).toEqual([['o1', 'ama.owusu@example.org']]))
    await waitFor(() => expect(state.again).toEqual(['ABCDEFGHJKMN']))
  })

  it('cancels a registration only after asking, and puts a cancelled one back', async () => {
    rights.now = doorWithFix
    state.orders = [...orders(), order({ id: 'o-gone', code: 'GHJKMNPQRSTU', name: 'Hana Gone', status: 'cancelled', promo_code: null, discount_pence: 0 })]
    const user = await find()
    await user.click(within(await menuOf(user, 'Ama Owusu')).getByRole('menuitem', { name: 'Cancel registration' }))
    // Nothing is cancelled by the first press.
    expect(state.marked).toEqual([])
    const ask = screen.getByRole('dialog')
    expect(ask).toHaveTextContent('Cancel Ama Owusu’s registration?')
    expect(ask).toHaveTextContent('the office is told a refund is owed')
    await user.click(within(ask).getByRole('button', { name: 'Cancel it' }))
    await waitFor(() => expect(state.marked).toEqual([['o1', 'cancel']]))

    const menu = await menuOf(user, 'Hana Gone')
    // A cancelled registration: put it back, its address, a note, their ticket — and nothing about money or the door.
    expect(labels(menu)).toEqual([expect.stringContaining('Put back'), expect.stringContaining('Change email address'), 'Add a note', expect.stringContaining('Open their ticket')])
    await user.click(within(menu).getByRole('menuitem', { name: /Put back/ }))
    await waitFor(() => expect(state.marked).toContainEqual(['o-gone', 'restore']))
  })

  it('puts a promo code on a registration made without it, where the event has one that could be used', async () => {
    rights.now = doorWithFix
    state.full = full({ promoCodes: [{ id: 'p1', event_id: 'e1', code: 'PASTOR100', kind: 'percent', value: 100, ticket_type_ids: [], max_uses: null, uses: 0, active: true, tickets_covered: null }] })
    state.orders = [order({ promo_code: null, discount_pence: 0, total_pence: 4000 }), ...orders().slice(1)]
    const user = await find()
    const menu = await menuOf(user, 'Ama Owusu')
    expect(labels(menu)).toContainEqual(expect.stringContaining('Apply a promo code'))
    // Sam has paid: a code is for a registration still to be paid.
    await user.click(within(menu).getByRole('menuitem', { name: /Apply a promo code/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('PASTOR100')
    await user.click(within(dialog).getByRole('button', { name: /Apply|Put/ }))
    await waitFor(() => expect(state.promos).toEqual([['o1', 'PASTOR100']]))
  })

  it('opens their ticket, for anybody working the door', async () => {
    rights.now = doorAsItWas
    const user = await find()
    await user.click(within(await menuOf(user, 'Ben Joseph')).getByRole('menuitem', { name: /Open their ticket/ }))
    expect(state.opened).toEqual([expect.stringMatching(/\/ticket\/BCDEFGHJKMNP$/)])
  })

  it('offers somebody who only checks in and takes payments none of it', async () => {
    rights.now = doorAsItWas
    const user = await find()
    // What the buttons already do, and their ticket: no waiver, no note, no address, no cancelling.
    expect(labels(await menuOf(user, 'Ama Owusu'))).toEqual([expect.stringContaining('Mark as paid'), expect.stringContaining('Check in'), expect.stringContaining('Open their ticket')])
  })

  it('never offers the office’s own at Reception, whoever is asking: verifying, “not received”, refunds, taking a code off', async () => {
    // Somebody with every right there is — the Owner, at the door.
    rights.now = { ...doorWithFix, office: true, edit: true, approve: true, refund: true, cancel: true, delete: true, verify: true }
    state.orders = [
      order({ payment_status: 'reported', payment_method: 'bank', proof_reference: 'REF-1' }),
      order({ id: 'o-owed', code: 'HJKMNPQRSTUV', name: 'Owed Back', status: 'cancelled', payment_status: 'received', refund_status: 'owed', promo_code: null, discount_pence: 0 }),
    ]
    const user = await find()
    const ama = labels(await menuOf(user, 'Ama Owusu')).join(' | ')
    expect(ama).not.toMatch(/Verify payment|Not received|Remove promo code|refund/i)
    expect(ama).toMatch(/Mark as paid/)
    await user.keyboard('{Escape}')
    expect(labels(await menuOf(user, 'Owed Back')).join(' | ')).not.toMatch(/refund/i)
  })

  it('gives somebody here to look only no menu at all', async () => {
    rights.now = { ...doorAsItWas, checkIn: false, takePayment: false, walkIn: false }
    show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull()
  })
})
