import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationEventPage } from './RegistrationEventPage'
import type { OrderRow, RegistrationEventFull } from '../lib/registrations'
import { resetUndoForTests } from '../lib/registrationUndo'

/*
 * One event, run from its page (0244, 0245): the numbers, who has
 * registered, what reception does to an order, and the export. Proof of
 * payment (0247): the receipt beside the order, Mark as received confirms
 * the ticket by email, Not received asks again; and the link's QR code.
 */

const state = vi.hoisted(() => ({
  full: null as unknown,
  orders: [] as unknown[],
  // The event's invitation links (0295).
  invites: [] as unknown[],
  // Promo codes put on registrations afterwards (0298): [order id, code], and a refusal to give.
  promoApplied: [] as unknown[],
  promoRefused: null as string | null,
  // Promo codes taken off again (0299): the order's id, and a refusal to give.
  promoRemoved: [] as string[],
  promoRemoveRefused: null as string | null,
  marked: [] as unknown[],
  notes: [] as unknown[],
  statuses: [] as unknown[],
  notified: [] as unknown[],
  cancelledEvents: [] as unknown[],
  toldCancelled: [] as string[],
  downloaded: [] as string[],
  exported: [] as { sheets: { name: string; rows: unknown[][] }[]; file: string }[],
  // What the page said, with whatever it offered to take back (0281).
  toasts: [] as { text: string; tone?: string; action?: { label: string; run: () => void } }[],
  undone: [] as string[],
  undoRefused: null as null | { message: string },
  // An address put right (0283): what was asked, what the database answered, and the email that follows.
  emails: [] as unknown[],
  emailChanged: true,
  emailRefused: false,
  again: [] as string[],
  againAnswer: { ok: true, sent: true } as { ok: boolean; sent?: boolean },
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }) }))
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
// The one thing the page asks of the database itself: put a registration back as it was.
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: { p_id: string }) => {
      if (fn !== 'registration_order_undo') throw new Error(`unexpected rpc ${fn}`)
      state.undone.push(args.p_id)
      return Promise.resolve(state.undoRefused ? { data: null, error: state.undoRefused } : { data: 'change', error: null })
    },
  },
}))
vi.mock('../lib/qrCamera', () => ({ useQrCamera: () => 'unavailable' }))
// The church's own giving details: read only for what its online link is called.
vi.mock('../lib/giving', async (original) => ({
  ...(await original<typeof import('../lib/giving')>()),
  fetchGiving: () =>
    Promise.resolve({
      page: { intro: null, qr_image_path: null, qr_image_caption: null },
      links: [{ id: 'l1', label: 'Paypal', url: 'https://paypal.me/church', note: null, show_qr: false, sort_order: 0 }],
      accounts: [],
    }),
}))
vi.mock('../lib/promoLater', async (original) => ({
  ...(await original<typeof import('../lib/promoLater')>()),
  applyPromoToOrder: (id: string, code: string) => {
    state.promoApplied.push([id, code])
    return state.promoRefused ? Promise.reject(new Error(state.promoRefused)) : Promise.resolve()
  },
  removePromoFromOrder: (id: string) => {
    state.promoRemoved.push(id)
    return state.promoRemoveRefused ? Promise.reject(new Error(state.promoRemoveRefused)) : Promise.resolve()
  },
}))
vi.mock('../lib/registrationInvites', async (original) => ({
  ...(await original<typeof import('../lib/registrationInvites')>()),
  fetchInvites: () => Promise.resolve(state.invites),
}))
vi.mock('../lib/qrPng', () => ({
  qrPngBlob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
  downloadBlob: (_blob: Blob, name: string) => state.downloaded.push(name),
}))
vi.mock('../lib/writeWorkbook', () => ({
  writeWorkbook: (sheets: { name: string; rows: unknown[][] }[], file: string) => {
    state.exported.push({ sheets, file })
    return Promise.resolve()
  },
}))
vi.mock('../lib/registrations', async (original) => ({
  ...(await original<typeof import('../lib/registrations')>()),
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
  verifyOrderPayment: (id: string, verified: boolean) => {
    state.marked.push([id, verified ? 'verify' : 'unverify'])
    return Promise.resolve()
  },
  setOrderNotes: (id: string, notes: string) => {
    state.notes.push([id, notes])
    return Promise.resolve()
  },
  setRegistrationStatus: (event: { id: string }, status: string) => {
    state.statuses.push([event.id, status])
    return Promise.resolve()
  },
  deleteRegistrationEvent: () => Promise.resolve(),
  cancelRegistrationEvent: (id: string, note: string) => {
    state.cancelledEvents.push([id, note])
    return Promise.resolve(2)
  },
  notifyEventCancelled: (id: string) => {
    state.toldCancelled.push(id)
    return Promise.resolve({ ok: true, sent: true })
  },
  fetchRefundDetails: () => Promise.resolve({ account_name: 'Cash Payer', sort_code: '200000', account_number: '12345678', iban: null, note: null, created_at: '2026-11-05T10:00:00Z' }),
  notifyPayment: (kind: string, code: string) => {
    state.notified.push([kind, code])
    return Promise.resolve({ ok: true, sent: true })
  },
  proofUrl: (path: string) => Promise.resolve(`https://signed/${path}`),
  setOrderEmail: (id: string, email: string) => {
    state.emails.push([id, email])
    return state.emailRefused ? Promise.reject(new Error('refused')) : Promise.resolve(state.emailChanged)
  },
  sendTicketAgain: (code: string) => {
    state.again.push(code)
    return Promise.resolve(state.againAnswer)
  },
}))

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const full = (over: Partial<RegistrationEventFull['event']> = {}): RegistrationEventFull => ({
  event: {
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
    ...over,
  },
  dates: [{ id: 'd1', event_id: 'e1', starts_at: at(2026, 11, 21, 18, 30), ends_at: at(2026, 11, 21, 21, 0), label: null, sort_order: 0, diary_event_id: null }],
  ticketTypes: [
    { id: 't1', event_id: 'e1', name: 'With lunch', description: null, kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: 40, sort_order: 0 },
    { id: 't2', event_id: 'e1', name: 'Standard', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: null, sort_order: 1 },
  ],
  promoCodes: [],
})

const order = (over: Partial<OrderRow>): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: '07700 900123',
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
  order({ id: 'o-ben', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', email: 'ben@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, payment_status: 'received', payment_method: 'bank', received_at: at(2026, 11, 20, 9, 15), receiver: { first_name: 'Rohit', last_name: 'F' }, tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
  // Says he paid online, with a screenshot and a reference (0247).
  order({ id: 'o-dan', code: 'EFGHJKMNPQRS', name: 'Dan Reported', email: 'dan@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, payment_status: 'reported', payment_method: 'paypal', proof_path: 'EFGHJKMNPQRS/a.png', proof_reference: 'PP-123', proof_at: at(2026, 11, 19, 20, 5), tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
  order({ id: 'o-grace', code: 'CDEFGHJKMNPQ', name: 'Grace Mensah', email: 'grace@example.org', quantity: 3, subtotal_pence: 0, discount_pence: 0, total_pence: 0, promo_code: null, payment_status: 'not_needed', checked_in_at: '2026-11-21T18:40:00Z', notes: 'Bringing the twins', tickets: [1, 2, 3].map(() => ({ ticket_type_id: 't2', attendee_name: null, unit_price_pence: 0 })) }),
  order({ id: 'o-asha', code: 'DEFGHJKMNPQR', name: 'Asha Mathew', email: 'asha@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, status: 'cancelled', tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
]

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/registrations/e1']}>
        <Routes>
          <Route path="/registrations/:id" element={<RegistrationEventPage />} />
          <Route path="/registrations/:id/edit" element={<p>editor</p>} />
          <Route path="/registrations" element={<p>all events</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: `Actions for ${name}` }))
  return screen.getByRole('menu')
}

beforeEach(() => {
  rights.now = { office: true, door: true, edit: true, approve: true, takePayment: true, refund: true, cancel: true, delete: true, checkIn: true, walkIn: true }
  state.full = full()
  state.orders = orders()
  state.invites = []
  state.promoApplied = []
  state.promoRefused = null
  state.promoRemoved = []
  state.promoRemoveRefused = null
  state.marked = []
  state.notes = []
  state.statuses = []
  state.notified = []
  state.cancelledEvents = []
  state.toldCancelled = []
  state.downloaded = []
  state.exported = []
  state.toasts = []
  state.undone = []
  state.undoRefused = null
  state.emails = []
  state.emailChanged = true
  state.emailRefused = false
  state.again = []
  state.againAnswer = { ok: true, sent: true }
  // Nothing remembered from the test before, and no ten seconds to wait for an email.
  resetUndoForTests(0)
})

describe('an event’s page', () => {
  it('shows the link, the numbers, each ticket type’s count and who is here', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://rim-church-app.vercel.app/register/plc-2026' })).toBeInTheDocument()
    // Four live orders, seven tickets; £20 in, £56 still owed; the cancelled one counts for nothing.
    const stat = (unit: string) => screen.getByText(unit).parentElement!.querySelector('.text-numeral')!.textContent
    expect(stat('orders')).toBe('4')
    expect(stat('tickets')).toBe('7')
    expect(stat('received')).toBe('£20.00')
    expect(stat('still to come')).toBe('£56.00')
    const types = within(screen.getByRole('list', { name: 'Ticket types' }))
    expect(types.getByText('4 / 40')).toBeInTheDocument()
    expect(screen.getByText('1 checked in')).toBeInTheDocument()
    const ama = screen.getByRole('listitem', { name: 'Ama Owusu' })
    expect(within(ama).getByText('Awaiting payment')).toBeInTheDocument()
    expect(within(ama).getByText('For Ama Owusu, Kofi Owusu')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Grace Mensah' })).getByText('Bringing the twins')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Asha Mathew' })).getByText('Cancelled')).toBeInTheDocument()
  })

  it('splits the tickets by how each is paid for, and the split adds up to the numbers above it', async () => {
    show()
    await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })
    const table = within(screen.getByRole('region', { name: 'How the tickets are paid for' })).getByRole('table')
    const total = within(within(table).getByRole('row', { name: /^All live registrations/ })).getAllByRole('cell')
    // The same four live orders and seven tickets the tiles say.
    expect(total.map((c) => c.textContent).slice(0, 2)).toEqual(['4', '7'])
  })

  it('finds a registration by what was typed, and filters by where it stands', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    await user.type(screen.getByRole('searchbox', { name: 'Search registrations' }), 'cdefghjkmnpq')
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Grace Mensah'])
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 5')
    await user.clear(screen.getByRole('searchbox', { name: 'Search registrations' }))

    const names = () => screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))
    const status = () => screen.getByRole('combobox', { name: 'Status' })
    const method = () => screen.getByRole('combobox', { name: 'Payment method' })
    const choose = async (box: HTMLElement, name: RegExp) => {
      await user.click(box)
      await user.click(screen.getByRole('option', { name }))
    }
    // Two dropdowns, each choice in its list saying how many it holds.
    await user.click(status())
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent!.replace('✓', ''))).toEqual([
      'All registrations',
      'Not paid yet1',
      'Receipt to check1',
      'Paid1',
      'Free1',
      'Payment to verify2',
      'Checked in1',
      'Cancelled1',
    ])
    await user.click(screen.getByRole('option', { name: /Not paid yet/ }))
    expect(names()).toEqual(['Ama Owusu'])
    await choose(status(), /Receipt to check/)
    expect(names()).toEqual(['Dan Reported'])
    await choose(status(), /^Paid/)
    expect(names()).toEqual(['Ben Joseph'])
    expect(status()).toHaveTextContent(/^Paid$/)
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 5')
    await choose(status(), /Free/)
    expect(names()).toEqual(['Grace Mensah'])
    await choose(status(), /All registrations/)

    // How it is paid: the online link by the name the church gave it.
    await user.click(method())
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent!.replace('✓', ''))).toEqual(['Any payment method', 'Bank transfer1', 'Paypal1', 'Not chosen yet1'])
    await user.click(screen.getByRole('option', { name: /Bank transfer/ }))
    expect(names()).toEqual(['Ben Joseph'])
    await choose(method(), /Paypal/)
    expect(names()).toEqual(['Dan Reported'])
    // Chosen together they narrow: with Paypal chosen, "Paid" would show nobody, so it is greyed and cannot be picked.
    await user.click(status())
    expect(screen.getByRole('option', { name: /^Paid/ })).toHaveAttribute('aria-disabled', 'true')
    await user.click(screen.getByRole('option', { name: /Receipt to check/ }))
    expect(names()).toEqual(['Dan Reported'])
    expect(screen.getByRole('status')).toHaveTextContent('Receipt to check · Paypal: Showing 1 of 5')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(names()).toHaveLength(5)
    expect(screen.queryByRole('status')).toBeNull()

    await choose(status(), /Checked in/)
    expect(names()).toEqual(['Grace Mensah'])
    await choose(status(), /Cancelled/)
    expect(names()).toEqual(['Asha Mathew'])
    await user.type(screen.getByRole('searchbox', { name: 'Search registrations' }), 'nobody')
    expect(screen.getByText('Nobody matches.')).toBeInTheDocument()
  })

  it('offers each order what fits it, and does it', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    let menu = await openMenu(user, 'Ama Owusu')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('Mark as received'),
      'Waive the payment',
      expect.stringContaining('Check in'),
      // She registered with a code (EARLY): it can be taken off again (0299).
      expect.stringContaining('Remove promo code'),
      'Add a note',
      'Cancel registration',
    ])
    await user.click(within(menu).getByRole('menuitem', { name: /Mark as received/ }))
    await waitFor(() => expect(state.marked).toEqual([['o1', 'received']]))

    menu = await openMenu(user, 'Ben Joseph')
    expect(within(menu).queryByRole('menuitem', { name: /Mark as received/ })).toBeNull()
    await user.click(within(menu).getByRole('menuitem', { name: 'Back to awaiting payment' }))
    await waitFor(() => expect(state.marked).toContainEqual(['o-ben', 'awaiting']))

    menu = await openMenu(user, 'Grace Mensah')
    expect(within(menu).queryByRole('menuitem', { name: /Waive/ })).toBeNull()
    await user.click(within(menu).getByRole('menuitem', { name: 'Undo check-in' }))
    await waitFor(() => expect(state.marked).toContainEqual(['o-grace', 'undo_check_in']))

    menu = await openMenu(user, 'Asha Mathew')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([expect.stringContaining('Put back'), 'Add a note'])
    await user.click(within(menu).getByRole('menuitem', { name: /Put back/ }))
    await waitFor(() => expect(state.marked).toContainEqual(['o-asha', 'restore']))
  })

  /*
   * Verifying (0267): the Pastor, who can see the bank and PayPal, says a
   * payment arrived. A right of its own — the office's rights above do not
   * include it — and a tag everybody else goes by.
   */
  it('offers no verifying to the office, whatever else it may do', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Dan Reported' })
    expect(screen.queryByRole('button', { name: 'Verify payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: /to verify/ })).toBeNull()
    const menu = await openMenu(user, 'Dan Reported')
    expect(within(menu).queryByRole('menuitem', { name: /Verify payment/ })).toBeNull()
  })

  it('gives whoever may verify a button on each payment said to be in, and says how many wait', async () => {
    rights.now = { office: true, door: true, verify: true }
    const user = show()
    // Dan says he paid, Ben is marked received: two to verify. Ama has not paid; Grace's is free.
    const wanting = await screen.findByRole('button', { name: /2\s*payments to verify/ })
    expect(within(screen.getByRole('listitem', { name: 'Ama Owusu' })).queryByRole('button', { name: 'Verify payment' })).toBeNull()
    expect(within(screen.getByRole('listitem', { name: 'Grace Mensah' })).queryByRole('button', { name: 'Verify payment' })).toBeNull()
    await user.click(wanting)
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label')).filter(Boolean)).toEqual(expect.arrayContaining(['Dan Reported', 'Ben Joseph']))
    expect(screen.queryByRole('listitem', { name: 'Ama Owusu' })).toBeNull()

    // Read only otherwise: nothing of the office's to press on the row.
    const dan = screen.getByRole('listitem', { name: 'Dan Reported' })
    expect(within(dan).queryByRole('button', { name: 'Mark as received' })).toBeNull()
    await user.click(within(dan).getByRole('button', { name: 'Verify payment' }))
    await waitFor(() => expect(state.marked).toEqual([['o-dan', 'verify']]))
  })

  it('lets a payment not yet reported be verified from the menu, and nothing else changed by a verifier', async () => {
    rights.now = { office: true, door: true, verify: true }
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    const menu = await openMenu(user, 'Ama Owusu')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([expect.stringContaining('Verify payment'), 'Add a note'])
  })

  it('shows the Verified payment tag to everybody, with who and when, and lets the verifier take it back', async () => {
    state.orders = orders().map((o) => (o.id === 'o-dan' ? { ...o, payment_verified_at: at(2026, 11, 20, 8, 0), verifier: { first_name: 'Pastor', last_name: 'John' } } : o))
    // The office sees the tag and carries on from it.
    const first = show()
    const dan = await screen.findByRole('listitem', { name: 'Dan Reported' })
    expect(within(dan).getByText('Verified payment')).toBeInTheDocument()
    expect(within(dan).getByText(/^Verified .* by Pastor John$/)).toBeInTheDocument()
    expect(within(dan).getByRole('button', { name: 'Mark as received' })).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Ben Joseph' })).queryByText('Verified payment')).toBeNull()
    let menu = await openMenu(first, 'Dan Reported')
    expect(within(menu).queryByRole('menuitem', { name: /verification/ })).toBeNull()
    await first.keyboard('{Escape}')
    cleanup()

    rights.now = { office: true, door: true, verify: true }
    const user = show()
    const again = await screen.findByRole('listitem', { name: 'Dan Reported' })
    expect(within(again).queryByRole('button', { name: 'Verify payment' })).toBeNull()
    menu = await openMenu(user, 'Dan Reported')
    await user.click(within(menu).getByRole('menuitem', { name: /Take back the verification/ }))
    await waitFor(() => expect(state.marked).toEqual([['o-dan', 'unverify']]))
  })

  it('cancels a registration only after asking', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    const menu = await openMenu(user, 'Ama Owusu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Cancel registration' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel Ama Owusu’s registration?' })
    expect(within(dialog).getByText(/2 tickets go back on sale/)).toBeInTheDocument()
    expect(state.marked).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Cancel it' }))
    await waitFor(() => expect(state.marked).toEqual([['o1', 'cancel']]))
  })

  it('keeps a note on an order', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    const menu = await openMenu(user, 'Ben Joseph')
    await user.click(within(menu).getByRole('menuitem', { name: 'Add a note' }))
    const dialog = screen.getByRole('dialog', { name: 'A note on Ben Joseph’s registration' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Note' }), 'Paid cash at the door')
    await user.click(within(dialog).getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(state.notes).toEqual([['o-ben', 'Paid cash at the door']]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('exports every order, every ticket and the sums', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    await user.click(screen.getByRole('button', { name: 'Export to Excel' }))
    await waitFor(() => expect(state.exported).toHaveLength(1))
    const { sheets, file } = state.exported[0]
    expect(file).toMatch(/^registrations-plc-2026-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(sheets.map((s) => s.name)).toEqual(['Orders', 'Tickets', 'Summary'])
    expect(sheets[0].rows).toHaveLength(5)
    expect(sheets[1].rows).toHaveLength(8)
  })

  it('shows the receipt beside an order that says it paid, and who took the money', async () => {
    const user = show()
    const dan = await screen.findByRole('listitem', { name: 'Dan Reported' })
    expect(within(dan).getByText('Receipt sent — being checked')).toBeInTheDocument()
    expect(within(dan).getByText('Ref PP-123')).toBeInTheDocument()
    // The receipt opens over the page, through a signed link made on the tap — no new tab, the page stays.
    const open = vi.spyOn(window, 'open')
    await user.click(within(dan).getByRole('button', { name: 'Open the receipt' }))
    const viewer = screen.getByRole('dialog', { name: 'Receipt from Dan Reported' })
    expect(await within(viewer).findByRole('img', { name: 'Receipt from Dan Reported' })).toHaveAttribute('src', 'https://signed/EFGHJKMNPQRS/a.png')
    expect(viewer).toHaveTextContent(/ref PP-123/)
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
    await user.click(within(viewer).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const ben = screen.getByRole('listitem', { name: 'Ben Joseph' })
    // How it was paid is its own tag beside "Paid", not a word at the end of this line.
    expect(within(ben).getByText(/^Received .* by Rohit F$/)).toBeInTheDocument()
    expect(within(ben).getByText('Bank transfer')).toBeInTheDocument()
  })

  it('says on each registration how it is paid, and keeps its ticket and its code on one line at the foot', async () => {
    show()
    const ben = await screen.findByRole('listitem', { name: 'Ben Joseph' })
    expect(within(ben).getByText('Paid')).toBeInTheDocument()
    expect(within(ben).getByText('Bank transfer')).toBeInTheDocument()
    const dan = screen.getByRole('listitem', { name: 'Dan Reported' })
    expect(await within(dan).findByText('Paypal')).toBeInTheDocument()
    // Nobody has said how: nothing is claimed. Free, or cancelled: no way of paying at all.
    expect(within(screen.getByRole('listitem', { name: 'Ama Owusu' })).queryByText(/Bank transfer|Paypal|At reception/)).toBeNull()
    expect(within(screen.getByRole('listitem', { name: 'Grace Mensah' })).queryByText(/Bank transfer|Paypal|At reception/)).toBeNull()
    // The ticket is a button of its own, named for whose it is, opening beside the app.
    const ticket = within(ben).getByRole('link', { name: 'Open Ben Joseph’s ticket' })
    expect(ticket).toHaveAttribute('href', expect.stringContaining('/ticket/BCDEFGHJKMNP'))
    expect(ticket).toHaveAttribute('target', '_blank')
    expect(ticket.parentElement).toHaveTextContent('BCDEFGHJKMNP')
  })

  it('says a promo code as a tag of its own, and leaves the sum alone beside the name', async () => {
    show()
    // Ama registered with EARLY, which took some off: £36.00 still to pay.
    const ama = await screen.findByRole('listitem', { name: 'Ama Owusu' })
    expect(within(ama).getByText('Code EARLY')).toBeInTheDocument()
    // The sum is the sum: the code used to follow it on the same unshrinking line, and a long one ran over the name.
    expect(within(ama).getByText('£36.00')).toHaveTextContent(/^£36\.00$/)
    // Nobody without a code is given the tag.
    expect(within(screen.getByRole('listitem', { name: 'Ben Joseph' })).queryByText(/^Code /)).toBeNull()
  })

  it('says up front what wants doing, each a tap to those orders, and gives a row its next step', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    // Awaiting money has no next step: there is nothing to decide until it arrives.
    expect(within(screen.getByRole('listitem', { name: 'Ama Owusu' })).queryByRole('button', { name: /Mark as/ })).toBeNull()
    expect(within(screen.getByRole('listitem', { name: 'Grace Mensah' })).getByText(/^Checked in /)).toBeInTheDocument()
    const todo = screen.getByRole('group', { name: 'What wants doing' })
    expect(within(todo).getAllByRole('button').map((b) => b.textContent)).toEqual(['1receipt to check', '1awaiting payment'])
    await user.click(within(todo).getByRole('button', { name: /receipt to check/ }))
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent(/^Receipt to check$/)
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Dan Reported'])
    // The receipt's row carries the decision, no menu needed.
    const dan = screen.getByRole('listitem', { name: 'Dan Reported' })
    await user.click(within(dan).getByRole('button', { name: 'Mark as received' }))
    await waitFor(() => expect(state.marked).toEqual([['o-dan', 'received']]))
    await waitFor(() => expect(state.notified).toContainEqual(['paid', 'EFGHJKMNPQRS']))
  })

  it('leads back to every event from the top', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    expect(screen.getByRole('link', { name: /Registrations/ })).toHaveAttribute('href', '/registrations')
  })

  it('confirms a reported payment by email, or sends it back with a word', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Dan Reported' })
    let menu = await openMenu(user, 'Dan Reported')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('Mark as received'),
      expect.stringContaining('Not received, ask again'),
      'Waive the payment',
      expect.stringContaining('Check in'),
      'Add a note',
      'Cancel registration',
    ])
    await user.click(within(menu).getByRole('menuitem', { name: /Not received, ask again/ }))
    const dialog = screen.getByRole('alertdialog', { name: 'Not received from Dan Reported?' })
    expect(dialog).toHaveTextContent(/an email to dan@example.org/)
    await user.click(within(dialog).getByRole('button', { name: 'Ask again' }))
    await waitFor(() => expect(state.marked).toEqual([['o-dan', 'awaiting']]))
    await waitFor(() => expect(state.notified).toEqual([['unmatched', 'EFGHJKMNPQRS']]))

    menu = await openMenu(user, 'Dan Reported')
    await user.click(within(menu).getByRole('menuitem', { name: /Mark as received/ }))
    await waitFor(() => expect(state.marked).toContainEqual(['o-dan', 'received']))
    await waitFor(() => expect(state.notified).toContainEqual(['paid', 'EFGHJKMNPQRS']))
  })

  it('downloads the link as a QR code, and opens Reception', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    await user.click(screen.getByRole('button', { name: 'Download QR code' }))
    await waitFor(() => expect(state.downloaded).toEqual(['plc-2026-qr.png']))
    expect(screen.getByRole('link', { name: 'Open Reception' })).toHaveAttribute('href', '/door?event=e1')
  })

  it('opens the door scanner, which checks a ticket in', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    await user.click(screen.getByRole('button', { name: 'Scan tickets' }))
    const dialog = screen.getByRole('dialog', { name: 'Scan tickets' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Ticket code' }), 'BCDEFGHJKMNP')
    await user.click(within(dialog).getByRole('button', { name: 'Find' }))
    // Ben has paid, so reading his ticket checks him in with no tap.
    await waitFor(() => expect(state.marked).toEqual([['o-ben', 'check_in']]))
    expect(within(dialog).getByText('Checked in')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows no scanner on a draft', async () => {
    state.full = full({ status: 'draft' })
    show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    expect(screen.queryByRole('button', { name: 'Scan tickets' })).toBeNull()
  })

  it('keeps Delete in the event’s own menu, refused while people are paid and not refunded', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    const menu = await openMenu(user, 'Pastors & Leaders 2026')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('Download QR code'),
      'Export to Excel',
      expect.stringContaining('Cancel event'),
      expect.stringContaining('Delete event'),
    ])
    // Ben and Dan have paid: nothing to delete until they are refunded.
    expect(within(menu).getByRole('menuitem', { name: /Delete event/ })).toHaveAccessibleName(/2 paid and not refunded/)
    expect(within(menu).getByRole('menuitem', { name: /Delete event/ })).toBeDisabled()
  })

  it('deletes an event with no money in only once its name is typed', async () => {
    state.orders = [order({ total_pence: 0, subtotal_pence: 0, discount_pence: 0, payment_status: 'not_needed', promo_code: null })]
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    await user.click(within(await openMenu(user, 'Pastors & Leaders 2026')).getByRole('menuitem', { name: /Delete event/ }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Pastors & Leaders 2026?' })
    expect(within(dialog).getByRole('button', { name: 'Delete for good' })).toBeDisabled()
    // The name to type is set apart and copies in one tap.
    expect(within(dialog).getByLabelText('The event’s name')).toHaveTextContent('Pastors & Leaders 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Copy name' }))
    expect(await navigator.clipboard.readText()).toBe('Pastors & Leaders 2026')
    expect(within(dialog).getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /Type the event’s name/ }), 'Pastors & Leaders 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    expect(await screen.findByText('all events')).toBeInTheDocument()
  })

  it('cancels the event, keeps every order, and tells everyone', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    await user.click(within(await openMenu(user, 'Pastors & Leaders 2026')).getByRole('menuitem', { name: /Cancel event/ }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel Pastors & Leaders 2026?' })
    expect(dialog).toHaveTextContent(/2 paid orders will be marked as owing a refund/)
    await user.type(within(dialog).getByRole('textbox', { name: /A word to everyone/ }), 'The hall flooded.')
    // The name typed back first, with a tap to copy it.
    expect(within(dialog).getByRole('button', { name: 'Cancel the event' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Copy name' }))
    expect(await navigator.clipboard.readText()).toBe('Pastors & Leaders 2026')
    await user.type(within(dialog).getByRole('textbox', { name: /Type the event’s name to cancel it/ }), 'Pastors & Leaders 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel the event' }))
    await waitFor(() => expect(state.cancelledEvents).toEqual([['e1', 'The hall flooded.']]))
    expect(state.toldCancelled).toEqual(['e1'])
  })

  it('shows a cancelled event, what is owed, and works a refund through', async () => {
    state.full = full({ status: 'closed', cancelled_at: '2026-11-04T10:00:00Z', cancel_note: 'The hall flooded.' })
    state.orders = [
      order({ id: 'o-cash', name: 'Cash Payer', total_pence: 2000, subtotal_pence: 2000, discount_pence: 0, promo_code: null, payment_status: 'received', payment_method: 'reception', refund_status: 'owed' }),
      order({ id: 'o-bank', code: 'BCDEFGHJKMNP', name: 'Bank Payer', total_pence: 2000, subtotal_pence: 2000, discount_pence: 0, promo_code: null, payment_status: 'received', payment_method: 'bank', refund_status: 'refunded', refund_at: '2026-11-05T10:00:00Z', refunder: { first_name: 'Rohit', last_name: 'F' } }),
    ]
    const user = show()
    const banner = await screen.findByRole('region', { name: 'Cancelled' })
    expect(banner).toHaveTextContent('The hall flooded.')
    expect(banner).toHaveTextContent(/1 refund still owed, £20.00/)
    expect(within(screen.getByRole('group', { name: 'What wants doing' })).getByRole('button', { name: /refund owed/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull()
    expect(within(screen.getByRole('listitem', { name: 'Bank Payer' })).getByText(/by Rohit F/)).toBeInTheDocument()
    const menu = await openMenu(user, 'Cash Payer')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('Where to send the refund'),
      expect.stringContaining('Mark as refunded'),
      'Add a note',
    ])
    await user.click(within(menu).getByRole('menuitem', { name: /Where to send the refund/ }))
    const sheet = screen.getByRole('dialog', { name: 'Refund for Cash Payer' })
    expect(await within(sheet).findByText('20-00-00')).toBeInTheDocument()
    expect(within(sheet).getByText('12345678')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Done' }))
    // The row's own button does the same as the menu.
    await user.click(within(screen.getByRole('listitem', { name: 'Cash Payer' })).getByRole('button', { name: 'Mark as refunded' }))
    await waitFor(() => expect(state.marked).toEqual([['o-cash', 'refunded']]))
  })

  it('offers the refund sheet whatever way they paid, and says when bank details came in (0253)', async () => {
    state.full = full({ status: 'closed', cancelled_at: '2026-11-04T10:00:00Z' })
    state.orders = [
      order({ id: 'o-bank', code: 'BCDEFGHJKMNP', name: 'Bank Payer', total_pence: 2000, subtotal_pence: 2000, discount_pence: 0, promo_code: null, payment_status: 'received', payment_method: 'bank', refund_status: 'owed' }),
      order({ id: 'o-pp', code: 'CDEFGHJKMNPQ', name: 'PayPal Payer', total_pence: 2000, subtotal_pence: 2000, discount_pence: 0, promo_code: null, payment_status: 'received', payment_method: 'paypal', refund_status: 'owed', refund_details: { created_at: at(2026, 11, 5, 10, 0) } }),
    ]
    const user = show()
    const bank = await screen.findByRole('listitem', { name: 'Bank Payer' })
    expect(within(bank).getByText('Paid by bank transfer: back to the account it came from')).toBeInTheDocument()
    const pp = screen.getByRole('listitem', { name: 'PayPal Payer' })
    expect(within(pp).getByText(/^Bank details sent /)).toBeInTheDocument()
    const menu = await openMenu(user, 'PayPal Payer')
    expect(within(menu).getByRole('menuitem', { name: /Where to send the refund/ })).toHaveAccessibleName(/They sent bank details to use/)
    expect(within(menu).getByRole('menuitem', { name: /Mark as refunded/ })).toHaveAccessibleName(/Sent to the account they gave/)
    await user.keyboard('{Escape}')
    await user.click(within(pp).getByRole('button', { name: 'Where to send it' }))
    const sheet = screen.getByRole('dialog', { name: 'Refund for PayPal Payer' })
    expect(sheet).toHaveTextContent(/paid through PayPal/)
    expect(sheet).toHaveTextContent(/rather than back through PayPal/)
    expect(await within(sheet).findByText('20-00-00')).toBeInTheDocument()
  })

  it('shows somebody with View & export only the reading and the export (0251)', async () => {
    rights.now = { office: true, door: false, edit: false, approve: false, takePayment: false, refund: false, cancel: false, delete: false, checkIn: false, walkIn: false }
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close registration' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Scan tickets' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open Reception' })).toBeNull()
    expect(within(await openMenu(user, 'Pastors & Leaders 2026')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('Download QR code'),
      'Export to Excel',
    ])
    await user.keyboard('{Escape}')
    expect(within(await openMenu(user, 'Ama Owusu')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Add a note'])
  })

  it('gives somebody who approves payments the payment actions and nothing else', async () => {
    rights.now = { office: true, door: false, edit: false, approve: true, takePayment: true, refund: false, cancel: false, delete: false, checkIn: false, walkIn: false }
    const user = show()
    await screen.findByRole('listitem', { name: 'Dan Reported' })
    expect(within(await openMenu(user, 'Dan Reported')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      expect.stringContaining('Mark as received'),
      expect.stringContaining('Not received, ask again'),
      'Waive the payment',
      'Add a note',
    ])
  })

  it('publishes a draft that has a date and a ticket type', async () => {
    state.full = full({ status: 'draft' })
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(state.statuses).toEqual([['e1', 'published']]))
  })

  it('will not publish an event with nothing to register for', async () => {
    const f = full({ status: 'draft' })
    f.ticketTypes = []
    state.full = f
    show()
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText(/Add at least one date and one ticket type/)).toBeInTheDocument()
  })
})

/*
 * Undo (0281). Every press that changes a registration says what it did
 * with Undo beside it; the registration's own menu keeps the offer once
 * the toast has gone; and an email to the attendee waits for the offer to
 * pass. What is put back is the database's to decide and is proved there:
 * here, that the page asks, and what it does with the answer.
 */
describe('taking a press back', () => {
  const lastOffer = () => state.toasts.filter((t) => t.action).at(-1)!

  it('says what was done with Undo on it, and a payment taken back never emails them', async () => {
    // An offer long enough to press: the email is waiting on it.
    resetUndoForTests(60_000)
    const user = show()
    const dan = await screen.findByRole('listitem', { name: 'Dan Reported' })
    await user.click(within(dan).getByRole('button', { name: 'Mark as received' }))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Marked as received']))
    expect(lastOffer().action!.label).toBe('Undo')
    expect(state.notified).toEqual([])

    lastOffer().action!.run()
    await waitFor(() => expect(state.undone).toEqual(['o-dan']))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Undone' }))
    // The email was dropped, not delayed: leaving the page sends whatever still waits, and nothing does.
    window.dispatchEvent(new Event('pagehide'))
    expect(state.notified).toEqual([])
  })

  it('sends the email after all when the undo is refused: the press stands', async () => {
    resetUndoForTests(60_000)
    state.undoRefused = { message: 'This registration has changed since. Use the menu to put it right.' }
    const user = show()
    const dan = await screen.findByRole('listitem', { name: 'Dan Reported' })
    await user.click(within(dan).getByRole('button', { name: 'Mark as received' }))
    await waitFor(() => expect(state.toasts).toHaveLength(1))
    lastOffer().action!.run()
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Could not undo that.', tone: 'error' }))
    expect(state.notified).toEqual([['paid', 'EFGHJKMNPQRS']])
  })

  it('keeps Undo at the top of the registration’s menu once the toast has gone, and there only', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    let menu = await openMenu(user, 'Ben Joseph')
    expect(within(menu).queryByRole('menuitem', { name: /^Undo/ })).toBeNull()
    await user.click(within(menu).getByRole('menuitem', { name: /Check in/ }))
    await waitFor(() => expect(state.marked).toEqual([['o-ben', 'check_in']]))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Checked in']))

    // Somebody else's row was not touched: no Undo on it.
    menu = await openMenu(user, 'Ama Owusu')
    expect(within(menu).queryByRole('menuitem', { name: /^Undo/ })).toBeNull()
    await user.keyboard('{Escape}')

    menu = await openMenu(user, 'Ben Joseph')
    const first = within(menu).getAllByRole('menuitem')[0]
    expect(first).toHaveTextContent('Undo')
    expect(first).toHaveTextContent('“Checked in” — puts it back exactly as it was')
    await user.click(first)
    await waitFor(() => expect(state.undone).toEqual(['o-ben']))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Undone' }))

    // Taken back: the menu is as it was.
    menu = await openMenu(user, 'Ben Joseph')
    expect(within(menu).queryByRole('menuitem', { name: /^Undo/ })).toBeNull()
  })

  it('offers Undo on a note, a cancellation and a verification alike', async () => {
    rights.now = { ...rights.now, verify: true }
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    let menu = await openMenu(user, 'Ben Joseph')
    await user.click(within(menu).getByRole('menuitem', { name: 'Add a note' }))
    const note = screen.getByRole('dialog', { name: 'A note on Ben Joseph’s registration' })
    await user.type(within(note).getByRole('textbox', { name: 'Note' }), 'Paid cash at the door')
    await user.click(within(note).getByRole('button', { name: 'Save note' }))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Note saved']))

    menu = await openMenu(user, 'Ama Owusu')
    await user.click(within(menu).getByRole('menuitem', { name: 'Cancel registration' }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel it' }))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Note saved', 'Registration cancelled']))

    await user.click(within(screen.getByRole('listitem', { name: 'Dan Reported' })).getByRole('button', { name: 'Verify payment' }))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Note saved', 'Registration cancelled', 'Payment verified']))
    expect(state.toasts.every((t) => t.action?.label === 'Undo')).toBe(true)

    // Each Undo is its own registration's.
    state.toasts[1].action!.run()
    await waitFor(() => expect(state.undone).toEqual(['o1']))
  })

  it('closes registration with Undo that opens it again', async () => {
    const user = show()
    await user.click(await screen.findByRole('button', { name: 'Close registration' }))
    await waitFor(() => expect(state.statuses).toEqual([['e1', 'closed']]))
    await waitFor(() => expect(state.toasts.map((t) => t.text)).toEqual(['Registration closed']))
    lastOffer().action!.run()
    await waitFor(() => expect(state.statuses).toEqual([['e1', 'closed'], ['e1', 'published']]))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Undone' }))
    // An event's status is not a registration: the database's undo is not asked.
    expect(state.undone).toEqual([])
  })
})

describe('what became of each registration’s email (0283)', () => {
  const lastOffer = () => state.toasts.filter((t) => t.action).at(-1)!
  const withEmail = () => ({ ...rights.now, email: true })
  const told = () => [
    // Typed with a slip: it bounced, and the mail server said why.
    order({ id: 'o-jerry', code: 'JERRYJERRY12', name: 'Jerry Typo', email: 'jerry4chrost@example.org', email_sent_at: at(2026, 11, 11, 11, 7), email_status: 'bounced', email_status_at: at(2026, 11, 11, 11, 8), email_status_detail: '550 5.1.1 The email account that you tried to reach does not exist.' }),
    order({ id: 'o-ben', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', email: 'ben@example.org', email_sent_at: at(2026, 11, 10, 18, 44), email_status: 'delivered' }),
    order({ id: 'o-old', code: 'CDEFGHJKMNPQ', name: 'Olive Old', email: 'olive@example.org', email_sent_at: at(2026, 11, 3, 10, 0) }),
    order({ id: 'o-new', code: 'DEFGHJKMNPQR', name: 'Nia New', email: 'nia@example.org', email_status: 'sent' }),
    order({ id: 'o-walk', code: 'EFGHJKMNPQRS', name: 'Walk In', email: null, source: 'walk_in' }),
    order({ id: 'o-gone', code: 'FGHJKMNPQRST', name: 'Cal Cancelled', email: 'cal@example.org', status: 'cancelled', email_status: 'bounced' }),
  ]

  it('says on each row whether its email arrived, and makes a bounce plain with the reason', async () => {
    state.orders = told()
    show()
    const jerry = await screen.findByRole('listitem', { name: 'Jerry Typo' })
    expect(within(jerry).getByText('Email bounced')).toBeInTheDocument()
    expect(within(jerry).getByText(/It could not be delivered\. The address is probably wrong\./)).toBeInTheDocument()
    expect(within(jerry).getByText(/550 5\.1\.1 The email account that you tried to reach does not exist\./)).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Ben Joseph' })).getByText('Email delivered')).toBeInTheDocument()
    // Sent before delivery was kept: emailed, and that is all that is known.
    expect(within(screen.getByRole('listitem', { name: 'Olive Old' })).getByText('Emailed')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'Nia New' })).getByText('Email sent')).toBeInTheDocument()
    // Nobody to email, nothing to say.
    expect(within(screen.getByRole('listitem', { name: 'Walk In' })).queryByText(/Email|Emailed/)).toBeNull()
    // A cancelled registration's bounce is not something to chase: said at the foot, with no reason and no button.
    const cal = within(screen.getByRole('listitem', { name: 'Cal Cancelled' }))
    expect(cal.getByText('Email bounced')).toHaveAttribute('title', 'It could not be delivered. The address is probably wrong.')
    expect(cal.queryByText(/It could not be delivered/)).toBeNull()
  })

  it('counts the emails that did not arrive, and a tap shows those registrations', async () => {
    state.orders = told()
    const user = show()
    await screen.findByRole('listitem', { name: 'Jerry Typo' })
    const doing = within(screen.getByRole('group', { name: 'What wants doing' }))
    await user.click(doing.getByRole('button', { name: /1\s*email not delivered/ }))
    expect(screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-label')).map((li) => li.getAttribute('aria-label'))).toEqual(['Jerry Typo'])
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent(/^Email not delivered$/)
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 6')
  })

  it('shows the status to everybody on the page, and the correcting only to whoever may', async () => {
    state.orders = told()
    const user = show()
    const jerry = await screen.findByRole('listitem', { name: 'Jerry Typo' })
    expect(within(jerry).getByText('Email bounced')).toBeInTheDocument()
    expect(within(jerry).queryByRole('button', { name: 'Correct email address' })).toBeNull()
    expect(within(await openMenu(user, 'Jerry Typo')).queryByRole('menuitem', { name: /email address/ })).toBeNull()
  })

  it('puts an address right from the row: the dialog says why it bounced, saves, and their email follows', async () => {
    rights.now = withEmail()
    state.orders = told()
    const user = show()
    const jerry = await screen.findByRole('listitem', { name: 'Jerry Typo' })
    await user.click(within(jerry).getByRole('button', { name: 'Correct email address' }))
    const dialog = await screen.findByRole('dialog', { name: 'Jerry Typo’s email address' })
    expect(within(dialog).getByText('Email bounced')).toBeInTheDocument()
    expect(within(dialog).getByText(/The mail server said: “550 5\.1\.1/)).toBeInTheDocument()
    const field = within(dialog).getByRole('textbox', { name: 'Email address' })
    expect(field).toHaveValue('jerry4chrost@example.org')
    // The same address: nothing to save, only to send again.
    expect(within(dialog).getByRole('button', { name: 'Send it again' })).toBeEnabled()

    await user.clear(field)
    await user.type(field, 'jerry4christ@example.org')
    await user.click(within(dialog).getByRole('button', { name: 'Save and send' }))
    await waitFor(() => expect(state.emails).toEqual([['o-jerry', 'jerry4christ@example.org']]))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(lastOffer()).toMatchObject({ text: 'Email address changed — their email goes to jerry4christ@example.org', action: { label: 'Undo' } })
    // Once the offer of an undo has passed, their email goes — by the kind the church may send.
    await waitFor(() => expect(state.again).toEqual(['JERRYJERRY12']))
  })

  it('holds the email while Undo is offered: an address typed with a slip, taken back, never gets their ticket', async () => {
    resetUndoForTests(60_000)
    rights.now = withEmail()
    state.orders = told()
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    await user.click(within(await openMenu(user, 'Ben Joseph')).getByRole('menuitem', { name: /Change email address/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Ben Joseph’s email address' })
    const field = within(dialog).getByRole('textbox', { name: 'Email address' })
    await user.clear(field)
    await user.type(field, 'somebody.else@example.org')
    await user.click(within(dialog).getByRole('button', { name: 'Save and send' }))
    await waitFor(() => expect(state.toasts.filter((t) => t.action)).toHaveLength(1))
    expect(state.again).toEqual([])

    lastOffer().action!.run()
    await waitFor(() => expect(state.undone).toEqual(['o-ben']))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Undone' }))
    window.dispatchEvent(new Event('pagehide'))
    expect(state.again).toEqual([])
  })

  it('sends the email again, at once and with nothing to undo, when the address is left as it is', async () => {
    resetUndoForTests(60_000)
    rights.now = withEmail()
    state.orders = told()
    state.emailChanged = false
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    await user.click(within(await openMenu(user, 'Ben Joseph')).getByRole('menuitem', { name: /Change email address/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Ben Joseph’s email address' })
    await user.click(within(dialog).getByRole('button', { name: 'Send it again' }))
    await waitFor(() => expect(state.again).toEqual(['BCDEFGHJKMNP']))
    expect(state.toasts).toEqual([{ text: 'Sending their email again to ben@example.org', tone: undefined, action: undefined }])
  })

  it('says so when the email could not be sent', async () => {
    rights.now = withEmail()
    state.orders = told()
    state.emailChanged = false
    state.againAnswer = { ok: false }
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    await user.click(within(await openMenu(user, 'Ben Joseph')).getByRole('menuitem', { name: /Change email address/ }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Ben Joseph’s email address' })).getByRole('button', { name: 'Send it again' }))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ tone: 'error', text: expect.stringContaining('The email to Ben Joseph could not be sent') }))
  })

  it('keeps the dialog open, with the reason, when the database refuses the address', async () => {
    rights.now = withEmail()
    state.orders = told()
    state.emailRefused = true
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    await user.click(within(await openMenu(user, 'Ben Joseph')).getByRole('menuitem', { name: /Change email address/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Ben Joseph’s email address' })
    const field = within(dialog).getByRole('textbox', { name: 'Email address' })
    await user.clear(field)
    await user.type(field, 'ben2@example.org')
    await user.click(within(dialog).getByRole('button', { name: 'Save and send' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not change the address.')
    expect(state.again).toEqual([])
    expect(state.toasts).toEqual([])
  })

  it('will not save something that is not an address, and offers a provider’s right spelling', async () => {
    rights.now = withEmail()
    state.orders = told()
    const user = show()
    await screen.findByRole('listitem', { name: 'Ben Joseph' })
    await user.click(within(await openMenu(user, 'Ben Joseph')).getByRole('menuitem', { name: /Change email address/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Ben Joseph’s email address' })
    const field = within(dialog).getByRole('textbox', { name: 'Email address' })
    await user.clear(field)
    await user.type(field, 'ben@')
    expect(within(dialog).getByRole('button', { name: 'Save and send' })).toBeDisabled()
    await user.type(field, 'gmial.com')
    await user.click(within(dialog).getByRole('button', { name: 'ben@gmail.com' }))
    expect(field).toHaveValue('ben@gmail.com')
    expect(within(dialog).getByRole('button', { name: 'Save and send' })).toBeEnabled()
  })

  it('gives a walk-in with no address one, and keeps a cancelled registration’s for later without emailing', async () => {
    rights.now = withEmail()
    state.orders = told()
    const user = show()
    await screen.findByRole('listitem', { name: 'Walk In' })
    expect(within(await openMenu(user, 'Walk In')).getByRole('menuitem', { name: /Add an email address/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(within(await openMenu(user, 'Cal Cancelled')).getByRole('menuitem', { name: /Change email address/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Cal Cancelled’s email address' })
    expect(within(dialog).getByText(/This registration is cancelled, so nothing is emailed now/)).toBeInTheDocument()
    const field = within(dialog).getByRole('textbox', { name: 'Email address' })
    // The same address on a cancelled registration: nothing to save and nothing to send.
    expect(within(dialog).getByRole('button', { name: 'Send it again' })).toBeDisabled()
    await user.clear(field)
    await user.type(field, 'cal2@example.org')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.emails).toEqual([['o-gone', 'cal2@example.org']]))
    await waitFor(() => expect(lastOffer()).toMatchObject({ text: 'Email address changed' }))
    window.dispatchEvent(new Event('pagehide'))
    expect(state.again).toEqual([])
  })

  it('tells an email the service never sent from one a mail server turned away', async () => {
    rights.now = withEmail()
    state.orders = [order({ id: 'o-f', name: 'Not Sent', email_status: 'failed', email_status_detail: 'Resend refused it (429): Too many requests' })]
    const user = show()
    const row = await screen.findByRole('listitem', { name: 'Not Sent' })
    expect(within(row).getByText('Email not sent')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Correct email address' }))
    const dialog = await screen.findByRole('dialog', { name: 'Not Sent’s email address' })
    expect(within(dialog).getByText(/The email service said: “Resend refused it \(429\)/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Send it again' })).toBeEnabled()
  })

  it('says who changed an address and what it was, and offers nothing once the details are blanked', async () => {
    rights.now = withEmail()
    state.orders = [
      order({ id: 'o-a', name: 'By The Office', email_changed_at: at(2026, 11, 12, 10, 2), changer: { first_name: 'Rohit', last_name: 'F' }, email_before: { email: 'old@example.org' } }),
      order({ id: 'o-b', code: 'BCDEFGHJKMNP', name: 'By Themselves', email_changed_at: at(2026, 11, 12, 10, 5), changer: null, email_before: { email: 'slip@example.org' } }),
      order({ id: 'o-c', code: 'CDEFGHJKMNPQ', name: 'Anonymised', email: 'anonymised@removed.invalid', anonymised_at: at(2027, 3, 1, 3, 0), email_status: 'bounced' }),
    ]
    const user = show()
    expect(within(await screen.findByRole('listitem', { name: 'By The Office' })).getByText(/Email address changed .* by Rohit F — was old@example\.org/)).toBeInTheDocument()
    expect(within(screen.getByRole('listitem', { name: 'By Themselves' })).getByText(/Email address changed .* by the attendee — was slip@example\.org/)).toBeInTheDocument()
    const gone = screen.getByRole('listitem', { name: 'Anonymised' })
    expect(within(gone).queryByText('Email bounced')).toBeNull()
    expect(within(await openMenu(user, 'Anonymised')).queryByRole('menuitem', { name: /email address/ })).toBeNull()
  })

  it('puts the status in the export', async () => {
    state.orders = told()
    const user = show()
    await screen.findByRole('listitem', { name: 'Jerry Typo' })
    await user.click(screen.getByRole('button', { name: 'Export to Excel' }))
    await waitFor(() => expect(state.exported).toHaveLength(1))
    const rows = state.exported[0].sheets[0].rows
    expect(rows.map((r) => [r[1], r[3]])).toEqual([
      ['Jerry Typo', 'Bounced'],
      ['Ben Joseph', 'Delivered'],
      ['Olive Old', 'Emailed (not tracked)'],
      ['Nia New', 'Sent'],
      ['Walk In', ''],
      ['Cal Cancelled', 'Bounced'],
    ])
  })
})

/*
 * Invitation links (0295) on the event's page: the list (its own tests are
 * RegistrationInvites.test.tsx), and each registration saying which link
 * it came by.
 */
describe('invite links on the event’s page', () => {
  const link = (over: object = {}) => ({
    id: 'i-youth',
    event_id: 'e1',
    token: 'W3HN8TQ2CEV6',
    label: 'Rim Youth WhatsApp',
    kind: 'group',
    locked_email: null,
    discount_kind: 'percent',
    discount_value: 100,
    ticket_type_ids: [],
    tickets_covered: 1,
    max_uses: 20,
    expires_at: null,
    active: true,
    anonymised_at: null,
    created_at: '2026-11-16T10:00:00Z',
    ...over,
  })
  const invited = () =>
    order({ id: 'o-inv', code: 'GHJKMNPQRSTU', name: 'Sarah Lee', email: 'sarah@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 2000, total_pence: 0, promo_code: null, invite_id: 'i-youth', payment_status: 'not_needed', tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] })

  it('lists the event’s links, with a way to make one, for whoever may edit events', async () => {
    state.invites = [link()]
    state.orders = [...orders(), invited()]
    show()
    const section = await screen.findByRole('region', { name: 'Invite links' })
    expect(within(section).getByRole('button', { name: 'New invite link' })).toBeInTheDocument()
    const row = await within(section).findByRole('listitem', { name: 'Rim Youth WhatsApp' })
    expect(row).toHaveTextContent('1 of 20 used')
    expect(row).toHaveTextContent('Registered: Sarah Lee')
    expect(within(row).getByLabelText('The link for Rim Youth WhatsApp')).toHaveTextContent('/register/plc-2026?invite=W3HN8TQ2CEV6')
  })

  it('says on a registration which link it came by, and that it is free by invitation — never a code', async () => {
    state.invites = [link()]
    state.orders = [...orders(), invited()]
    show()
    const row = await screen.findByRole('listitem', { name: 'Sarah Lee' })
    expect(await within(row).findByText('Invited: Rim Youth WhatsApp')).toBeInTheDocument()
    expect(within(row).getByText('Free by invitation')).toBeInTheDocument()
    // A registration with a code still says its code, and one with neither says neither.
    expect(within(screen.getByRole('listitem', { name: 'Ama Owusu' })).queryByText(/Invited/)).toBeNull()
  })

  it('does not call a free registration “free by invitation” when the link took nothing off', async () => {
    // A link with no discount on a free ticket: it records who came by it, and that is all it did.
    state.invites = [link({ discount_kind: null, discount_value: null, max_uses: null })]
    state.orders = [order({ id: 'o-free', code: 'HJKMNPQRSTUV', name: 'Free Guest', quantity: 1, subtotal_pence: 0, discount_pence: 0, total_pence: 0, promo_code: null, invite_id: 'i-youth', payment_status: 'not_needed', tickets: [{ ticket_type_id: 't2', attendee_name: null, unit_price_pence: 0 }] })]
    show()
    const row = await screen.findByRole('listitem', { name: 'Free Guest' })
    expect(await within(row).findByText('Invited: Rim Youth WhatsApp')).toBeInTheDocument()
    expect(within(row).getAllByText('Free').length).toBeGreaterThan(0)
    expect(within(row).queryByText('Free by invitation')).toBeNull()
  })

  it('names the link in the export', async () => {
    state.invites = [link()]
    state.orders = [invited()]
    const user = show()
    await screen.findByText('Invited: Rim Youth WhatsApp')
    await user.click(screen.getByRole('button', { name: 'Export to Excel' }))
    await waitFor(() => expect(state.exported).toHaveLength(1))
    expect(state.exported[0].sheets[0].rows[0][10]).toBe('Rim Youth WhatsApp')
  })

  it('offers no way to make one on a cancelled event, or to somebody who may not edit', async () => {
    state.invites = [link()]
    state.full = full({ cancelled_at: '2026-11-10T10:00:00Z', status: 'closed' })
    show()
    const section = await screen.findByRole('region', { name: 'Invite links' })
    await within(section).findByRole('listitem', { name: 'Rim Youth WhatsApp' })
    expect(within(section).queryByRole('button', { name: 'New invite link' })).toBeNull()
    cleanup()

    state.full = full()
    rights.now = { office: true, door: false, edit: false, approve: false, takePayment: false, refund: false, cancel: false, delete: false, checkIn: false, walkIn: false }
    show()
    const again = await screen.findByRole('region', { name: 'Invite links' })
    await within(again).findByRole('listitem', { name: 'Rim Youth WhatsApp' })
    expect(within(again).queryByRole('button', { name: 'New invite link' })).toBeNull()
    expect(within(again).queryByRole('button', { name: /Turn off/ })).toBeNull()
  })

  it('draws no section for somebody who may not edit while there are no links', async () => {
    rights.now = { office: true, door: false, edit: false, approve: false, takePayment: false, refund: false, cancel: false, delete: false, checkIn: false, walkIn: false }
    show()
    await screen.findByRole('heading', { name: /Who has registered/ })
    expect(screen.queryByRole('region', { name: 'Invite links' })).toBeNull()
  })
})

/*
 * A promo code put on a registration made without it (0298), the
 * registrations that share an address, and money received kept apart from
 * money waived.
 */
describe('registrations made without the code, twice, or waived', () => {
  const FREE = { id: 'p-free', event_id: 'e1', code: 'FREE', kind: 'percent', value: 100, ticket_type_ids: [], max_uses: null, uses: 3, active: true, tickets_covered: null }
  const withCodes = (codes: object[]) => ({ ...full(), promoCodes: codes })
  // Registered without the code: one £20 ticket, awaiting payment.
  const unpaid = (over: Partial<OrderRow> = {}) =>
    order({ id: 'o-un', code: 'JKMNPQRSTUVW', name: 'Binitha John', email: 'binitha@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, payment_status: 'awaiting', tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }], ...over })

  it('puts a code on somebody’s registration for them, from its menu', async () => {
    state.full = withCodes([FREE])
    state.orders = [unpaid()]
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    const menu = await openMenu(user, 'Binitha John')
    await user.click(within(menu).getByRole('menuitem', { name: /Apply a promo code/ }))

    const dialog = await screen.findByRole('form', { name: 'A promo code for Binitha John’s registration' })
    expect(dialog).toHaveTextContent('owe £20.00')
    // The one usable code is already chosen, with what it leaves.
    expect(within(dialog).getByRole('radio', { name: /FREE.*nothing left to pay/ })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Apply FREE' }))

    await waitFor(() => expect(state.promoApplied).toEqual([['o-un', 'FREE']]))
    await waitFor(() => expect(screen.queryByRole('form', { name: /A promo code for/ })).toBeNull())
    // Said, with Undo on it like every other press.
    expect(state.toasts.at(-1)).toMatchObject({ text: 'Promo code FREE applied', action: { label: 'Undo' } })
  })

  it('shows what the database refused, and keeps the dialog', async () => {
    state.full = withCodes([FREE])
    state.orders = [unpaid()]
    state.promoRefused = 'That promo code is not valid.'
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    await user.click(within(await openMenu(user, 'Binitha John')).getByRole('menuitem', { name: /Apply a promo code/ }))
    const dialog = await screen.findByRole('form', { name: /A promo code for/ })
    await user.click(within(dialog).getByRole('button', { name: 'Apply FREE' }))
    expect(await within(dialog).findByText('The code could not be put on that registration.')).toBeInTheDocument()
  })

  it('offers it only for a registration that can take one', async () => {
    state.full = withCodes([FREE])
    state.orders = [
      unpaid(),
      unpaid({ id: 'o-code', name: 'Has Code', email: 'a@example.org', promo_code: 'EARLY', discount_pence: 200, total_pence: 1800 }),
      unpaid({ id: 'o-paid', name: 'Has Paid', email: 'b@example.org', payment_status: 'received' }),
      unpaid({ id: 'o-waived', name: 'Was Waived', email: 'c@example.org', payment_status: 'waived' }),
      unpaid({ id: 'o-inv', name: 'By Invite', email: 'd@example.org', invite_id: 'i1' }),
    ]
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    const offered = async (name: string) => {
      const menu = await openMenu(user, name)
      const there = within(menu).queryByRole('menuitem', { name: /Apply a promo code/ }) !== null
      await user.keyboard('{Escape}')
      return there
    }
    expect(await offered('Binitha John')).toBe(true)
    expect(await offered('Has Code')).toBe(false)
    expect(await offered('Has Paid')).toBe(false)
    expect(await offered('Was Waived')).toBe(false)
    expect(await offered('By Invite')).toBe(false)
  })

  it('does not offer it when the event has no usable code, or to somebody who may not approve payments', async () => {
    state.full = withCodes([{ ...FREE, active: false }, { ...FREE, id: 'p-used', code: 'USEDUP', max_uses: 3, uses: 3 }])
    state.orders = [unpaid()]
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    expect(within(await openMenu(user, 'Binitha John')).queryByRole('menuitem', { name: /Apply a promo code/ })).toBeNull()
    cleanup()

    state.full = withCodes([FREE])
    rights.now = { office: true, door: false, edit: true, approve: false, takePayment: false, refund: false, cancel: true, delete: false, checkIn: false, walkIn: false }
    const again = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    expect(within(await openMenu(again, 'Binitha John')).queryByRole('menuitem', { name: /Apply a promo code/ })).toBeNull()
  })

  // Free with a code that should not have been on it (0299).
  const coded = (over: Partial<OrderRow> = {}) => unpaid({ promo_code: 'FREE', discount_pence: 2000, total_pence: 0, payment_status: 'not_needed', ...over })

  it('takes a promo code off a registration again, only after asking', async () => {
    state.orders = [coded()]
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    const item = within(await openMenu(user, 'Binitha John')).getByRole('menuitem', { name: /Remove promo code/ })
    expect(item).toHaveTextContent('It goes back to £20.00, awaiting payment')
    await user.click(item)

    // What it will do, said before it is done: the price, the code's use, and who is told.
    const dialog = screen.getByRole('alertdialog', { name: 'Remove the promo code from Binitha John’s registration?' })
    expect(dialog).toHaveTextContent('FREE comes off and has its use back.')
    expect(dialog).toHaveTextContent('goes back to £20.00, awaiting payment, and an email to binitha@example.org asks for it.')
    expect(state.promoRemoved).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Remove it' }))

    await waitFor(() => expect(state.promoRemoved).toEqual(['o-un']))
    // Said, with Undo on it like every other press.
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Promo code FREE removed', action: { label: 'Undo' } }))
    // …and, the offer of an undo over, they are emailed their registration as it now stands.
    await waitFor(() => expect(state.again).toEqual(['JKMNPQRSTUVW']))
  })

  it('tells whoever pressed when the attendee’s email did not go', async () => {
    state.orders = [coded()]
    // Held back, or not set up: nothing was sent.
    state.againAnswer = { ok: true, sent: false }
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    await user.click(within(await openMenu(user, 'Binitha John')).getByRole('menuitem', { name: /Remove promo code/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove it' }))
    await waitFor(() => expect(state.toasts.some((t) => /Binitha John was not emailed about this/.test((t as { text: string }).text))).toBe(true))
  })

  it('keeps the code when asked to, and says nobody is told when there is no address', async () => {
    state.orders = [coded({ email: null })]
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    await user.click(within(await openMenu(user, 'Binitha John')).getByRole('menuitem', { name: /Remove promo code/ }))
    const dialog = screen.getByRole('alertdialog', { name: /Remove the promo code/ })
    expect(dialog).toHaveTextContent('They gave no email address, so nobody is told.')
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(state.promoRemoved).toEqual([])
  })

  it('says so when the code had taken nothing off: no price to go back to, and nobody to tell', async () => {
    // Free tickets only, registered with a code typed in: it came to nothing, and still spent a use.
    state.orders = [unpaid({ subtotal_pence: 0, total_pence: 0, discount_pence: 0, payment_status: 'not_needed', promo_code: 'FREE' })]
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    const item = within(await openMenu(user, 'Binitha John')).getByRole('menuitem', { name: /Remove promo code/ })
    expect(item).toHaveTextContent('It took nothing off: the code just has its use back')
    await user.click(item)
    const dialog = screen.getByRole('alertdialog', { name: /Remove the promo code/ })
    expect(dialog).toHaveTextContent('It took nothing off this registration, so the price stays as it is and nobody is told.')
    expect(dialog).not.toHaveTextContent('awaiting payment')
    await user.click(within(dialog).getByRole('button', { name: 'Remove it' }))
    await waitFor(() => expect(state.promoRemoved).toEqual(['o-un']))
    await waitFor(() => expect(state.toasts.at(-1)).toMatchObject({ text: 'Promo code FREE removed' }))
    // Nothing changed for them, so nothing is sent.
    expect(state.again).toEqual([])
  })

  it('shows what the database refused when a code will not come off', async () => {
    state.orders = [coded()]
    state.promoRemoveRefused = 'This registration has been checked in. Undo the check-in first.'
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    await user.click(within(await openMenu(user, 'Binitha John')).getByRole('menuitem', { name: /Remove promo code/ }))
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove it' }))
    expect(await screen.findByText('The code could not be taken off that registration.')).toBeInTheDocument()
  })

  it('offers to take a code off only where there is one, and says what stands in the way', async () => {
    state.orders = [
      coded(),
      unpaid({ id: 'o-part', name: 'Part Off', email: 'p@example.org', promo_code: 'EARLY', discount_pence: 200, total_pence: 1800 }),
      unpaid({ id: 'o-none', name: 'No Code', email: 'n@example.org' }),
      unpaid({ id: 'o-inv', name: 'By Invite', email: 'd@example.org', invite_id: 'i1', discount_pence: 2000, total_pence: 0, payment_status: 'not_needed' }),
      coded({ id: 'o-gone', name: 'Was Cancelled', email: 'g@example.org', status: 'cancelled' }),
      coded({ id: 'o-in', name: 'Checked In', email: 'i@example.org', checked_in_at: '2026-11-17T10:00:00Z' }),
      unpaid({ id: 'o-paid', name: 'Has Paid', email: 'b@example.org', promo_code: 'EARLY', discount_pence: 200, total_pence: 1800, payment_status: 'received' }),
      unpaid({ id: 'o-said', name: 'Says Paid', email: 's@example.org', promo_code: 'EARLY', discount_pence: 200, total_pence: 1800, payment_status: 'reported' }),
    ]
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    // null: not offered; otherwise whether it can be pressed, and its hint.
    const offered = async (name: string) => {
      const item = within(await openMenu(user, name)).queryByRole('menuitem', { name: /Remove promo code/ })
      const found = item ? { pressable: item.getAttribute('aria-disabled') !== 'true' && !(item as HTMLButtonElement).disabled, words: item.textContent ?? '' } : null
      await user.keyboard('{Escape}')
      return found
    }
    expect(await offered('Binitha John')).toMatchObject({ pressable: true })
    expect(await offered('Part Off')).toMatchObject({ pressable: true })
    expect(await offered('No Code')).toBeNull()
    expect(await offered('By Invite')).toBeNull()
    expect(await offered('Was Cancelled')).toBeNull()
    const checkedIn = await offered('Checked In')
    expect(checkedIn?.pressable).toBe(false)
    expect(checkedIn?.words).toContain('undo the check-in first')
    const paid = await offered('Has Paid')
    expect(paid?.pressable).toBe(false)
    expect(paid?.words).toContain('put it back to awaiting payment first')
    const said = await offered('Says Paid')
    expect(said?.pressable).toBe(false)
    expect(said?.words).toContain('settle that first')
  })

  it('does not offer to take a code off to somebody who may not approve payments', async () => {
    state.orders = [coded()]
    rights.now = { office: true, door: false, edit: true, approve: false, takePayment: false, refund: false, cancel: true, delete: false, checkIn: false, walkIn: false }
    const user = show()
    await screen.findByRole('listitem', { name: 'Binitha John' })
    expect(within(await openMenu(user, 'Binitha John')).queryByRole('menuitem', { name: /Remove promo code/ })).toBeNull()
  })

  it('marks registrations that share an email, counts them, and shows only those when asked', async () => {
    // One person, twice: once without the code and waiting to be paid, once free with it.
    state.orders = [
      unpaid(),
      unpaid({ id: 'o-free', code: 'KMNPQRSTUVWX', email: ' Binitha@Example.org ', promo_code: 'FREE', discount_pence: 2000, total_pence: 0, payment_status: 'not_needed' }),
      unpaid({ id: 'o-other', code: 'MNPQRSTUVWXY', name: 'Somebody Else', email: 'else@example.org' }),
    ]
    const user = show()
    await screen.findByRole('listitem', { name: 'Somebody Else' })
    const rows = () => within(screen.getByRole('list', { name: 'Orders' })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))
    expect(screen.getAllByText('Same email as another')).toHaveLength(2)
    expect(within(screen.getByRole('listitem', { name: 'Somebody Else' })).queryByText('Same email as another')).toBeNull()

    const wants = screen.getByRole('group', { name: 'What wants doing' })
    await user.click(within(wants).getByRole('button', { name: /2\s*registrations share an email/ }))
    expect(rows()).toEqual(['Binitha John', 'Binitha John'])
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent(/^Same email twice$/)
  })

  it('draws no empty "What wants doing" on a cancelled event whose only news is a shared email', async () => {
    state.full = { ...full({ cancelled_at: '2026-11-10T10:00:00Z', status: 'closed' }) }
    // Both free: nothing awaited, nothing owed back.
    state.orders = [
      unpaid({ id: 'a', subtotal_pence: 0, total_pence: 0, payment_status: 'not_needed' }),
      unpaid({ id: 'b', code: 'KMNPQRSTUVWX', subtotal_pence: 0, total_pence: 0, payment_status: 'not_needed' }),
    ]
    show()
    await screen.findByRole('list', { name: 'Orders' })
    // Still tagged on the rows; just nothing to do about it up top.
    expect(screen.getAllByText('Same email as another')).toHaveLength(2)
    expect(screen.queryByRole('group', { name: 'What wants doing' })).toBeNull()
  })

  it('says nothing about shared emails when every registration has its own', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    expect(screen.queryByText('Same email as another')).toBeNull()
    expect(screen.queryByRole('button', { name: /share an email/ })).toBeNull()
  })

  it('keeps a waived payment out of the money received, and says it beside it', async () => {
    // £20 came in, £20 was waived, £20 is still to come.
    state.orders = [
      unpaid({ id: 'a', name: 'Paid Up', email: 'a@example.org', payment_status: 'received' }),
      unpaid({ id: 'b', name: 'Let Off', email: 'b@example.org', payment_status: 'waived' }),
      unpaid({ id: 'c', name: 'Still Owes', email: 'c@example.org' }),
    ]
    show()
    await screen.findByRole('listitem', { name: 'Paid Up' })
    const stat = (unit: string) => screen.getByText(unit).parentElement!.querySelector('.text-numeral')!.textContent
    expect(stat('received')).toBe('£20.00')
    expect(stat('still to come')).toBe('£20.00')
    expect(screen.getByText('plus £20.00 waived')).toBeInTheDocument()
  })

  it('says nothing about waiving when nothing was waived', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    expect(screen.queryByText(/waived$/)).toBeNull()
  })
})
