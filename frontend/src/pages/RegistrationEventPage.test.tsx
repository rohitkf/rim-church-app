import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationEventPage } from './RegistrationEventPage'
import type { OrderRow, RegistrationEventFull } from '../lib/registrations'

/*
 * One event, run from its page (0244, 0245): the numbers, who has
 * registered, what reception does to an order, and the export. Proof of
 * payment (0247): the receipt beside the order, Mark as received confirms
 * the ticket by email, Not received asks again; and the link's QR code.
 */

const state = vi.hoisted(() => ({
  full: null as unknown,
  orders: [] as unknown[],
  marked: [] as unknown[],
  notes: [] as unknown[],
  statuses: [] as unknown[],
  notified: [] as unknown[],
  cancelledEvents: [] as unknown[],
  toldCancelled: [] as string[],
  downloaded: [] as string[],
  exported: [] as { sheets: { name: string; rows: unknown[][] }[]; file: string }[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }) }))
const rights = vi.hoisted(() => ({ now: { office: true, door: true, edit: true, approve: true, takePayment: true, refund: true, cancel: true, delete: true, checkIn: true, walkIn: true } as Record<string, boolean> }))
vi.mock('../lib/registrationRights', async (original) => ({
  ...(await original<typeof import('../lib/registrationRights')>()),
  useRegistrationRights: () => rights.now,
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/toast', () => ({ showToast: () => undefined }))
vi.mock('../lib/qrCamera', () => ({ useQrCamera: () => 'unavailable' }))
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
  state.marked = []
  state.notes = []
  state.statuses = []
  state.notified = []
  state.cancelledEvents = []
  state.toldCancelled = []
  state.downloaded = []
  state.exported = []
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

  it('finds a registration by what was typed, and filters by where it stands', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Ama Owusu' })
    await user.type(screen.getByRole('searchbox', { name: 'Search registrations' }), 'cdefghjkmnpq')
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Grace Mensah'])
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search registrations' }))

    const show_ = screen.getByRole('radiogroup', { name: 'Show' })
    // Each segment says how many it holds.
    await user.click(within(show_).getByRole('radio', { name: 'To pay 2' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Ama Owusu', 'Dan Reported'])
    await user.click(within(show_).getByRole('radio', { name: 'Receipts 1' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Dan Reported'])
    await user.click(within(show_).getByRole('radio', { name: 'Paid 1' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Ben Joseph'])
    await user.click(within(show_).getByRole('radio', { name: 'Checked in 1' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Grace Mensah'])
    await user.click(within(show_).getByRole('radio', { name: 'Cancelled 1' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Asha Mathew'])
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
    expect(within(ben).getByText(/^Received .* by Rohit F · bank transfer$/)).toBeInTheDocument()
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
    expect(screen.getByRole('radio', { name: 'Receipts 1' })).toBeChecked()
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew|Reported/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Dan Reported'])
    // The receipt's row carries the decision, no menu needed.
    const dan = screen.getByRole('listitem', { name: 'Dan Reported' })
    await user.click(within(dan).getByRole('button', { name: 'Mark as received' }))
    await waitFor(() => expect(state.marked).toEqual([['o-dan', 'received']]))
    expect(state.notified).toContainEqual(['paid', 'EFGHJKMNPQRS'])
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
    expect(state.notified).toEqual([['unmatched', 'EFGHJKMNPQRS']])

    menu = await openMenu(user, 'Dan Reported')
    await user.click(within(menu).getByRole('menuitem', { name: /Mark as received/ }))
    await waitFor(() => expect(state.marked).toContainEqual(['o-dan', 'received']))
    expect(state.notified).toContainEqual(['paid', 'EFGHJKMNPQRS'])
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
