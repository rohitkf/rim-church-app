import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RegistrationEventPage } from './RegistrationEventPage'
import type { OrderRow, RegistrationEventFull } from '../lib/registrations'

/*
 * One event, run from its page (0244, 0245): the numbers, who has
 * registered, what reception does to an order, and the export.
 */

const state = vi.hoisted(() => ({
  full: null as unknown,
  orders: [] as unknown[],
  marked: [] as unknown[],
  notes: [] as unknown[],
  statuses: [] as unknown[],
  exported: [] as { sheets: { name: string; rows: unknown[][] }[]; file: string }[],
}))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: true, session: { user: { id: 'me' } } }) }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/toast', () => ({ showToast: () => undefined }))
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
  order({ id: 'o-ben', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', email: 'ben@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, payment_status: 'received', payment_method: 'bank', tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
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
  state.full = full()
  state.orders = orders()
  state.marked = []
  state.notes = []
  state.statuses = []
  state.exported = []
})

describe('an event’s page', () => {
  it('shows the link, the numbers, each ticket type’s count and who is here', async () => {
    show()
    expect(await screen.findByRole('heading', { name: 'Pastors & Leaders 2026' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://rim-church-app.vercel.app/register/plc-2026' })).toBeInTheDocument()
    // Three live orders, six tickets; £20 in, £36 still owed; the cancelled one counts for nothing.
    const stat = (unit: string) => screen.getByText(unit).parentElement!.querySelector('.text-numeral')!.textContent
    expect(stat('orders')).toBe('3')
    expect(stat('tickets')).toBe('6')
    expect(stat('received')).toBe('£20.00')
    expect(stat('still to come')).toBe('£36.00')
    const types = within(screen.getByRole('list', { name: 'Ticket types' }))
    expect(types.getByText('3 / 40')).toBeInTheDocument()
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
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Grace Mensah'])
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search registrations' }))

    const show_ = screen.getByRole('radiogroup', { name: 'Show' })
    await user.click(within(show_).getByRole('radio', { name: 'To pay' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Ama Owusu'])
    await user.click(within(show_).getByRole('radio', { name: 'Paid' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Ben Joseph'])
    await user.click(within(show_).getByRole('radio', { name: 'Checked in' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Grace Mensah'])
    await user.click(within(show_).getByRole('radio', { name: 'Cancelled' }))
    expect(screen.getAllByRole('listitem', { name: /Owusu|Joseph|Mensah|Mathew/ }).map((l) => l.getAttribute('aria-label'))).toEqual(['Asha Mathew'])
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
    expect(sheets[0].rows).toHaveLength(4)
    expect(sheets[1].rows).toHaveLength(7)
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
