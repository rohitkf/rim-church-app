import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TicketScanner } from './TicketScanner'
import type { EventDate, OrderRow } from '../lib/registrations'

/*
 * The door (0246): a scanned ticket brings up its order; one tap checks
 * them in, one more takes the money as well.
 */

const cam = vi.hoisted(() => ({ onText: null as null | ((text: string) => void) }))
vi.mock('../lib/qrCamera', () => ({
  useQrCamera: (_ref: unknown, onText: (text: string) => void) => {
    cam.onText = onText
    return 'scanning'
  },
}))

const scan = (text: string) => act(() => cam.onText!(text))

const order = (over: Partial<OrderRow>): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: null,
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
  // Checked in earlier today: a check-in is a day's (0254).
  order({ id: 'o-ben', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', quantity: 1, total_pence: 2000, promo_code: null, payment_status: 'received', checked_in_at: new Date(new Date().setHours(18, 40, 0, 0)).toISOString(), tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
  order({ id: 'o-asha', code: 'CDEFGHJKMNPQ', name: 'Asha Mathew', status: 'cancelled' }),
  order({ id: 'o-grace', code: 'DEFGHJKMNPQR', name: 'Grace Mensah', total_pence: 0, payment_status: 'not_needed', promo_code: null, date_id: 'd-tomorrow', notes: 'Wheelchair space' }),
  order({ id: 'o-sam', code: 'EFGHJKMNPQRS', name: 'Sam Paul', quantity: 1, total_pence: 2000, promo_code: null, payment_status: 'received', tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
]
const dates: EventDate[] = [
  { id: 'd-today', event_id: 'e1', starts_at: new Date(new Date().setHours(18, 30, 0, 0)).toISOString(), ends_at: null, label: 'Tonight', sort_order: 0, diary_event_id: null },
  { id: 'd-tomorrow', event_id: 'e1', starts_at: new Date(new Date().setHours(18, 30, 0, 0) + 86400000).toISOString(), ends_at: null, label: 'Tomorrow', sort_order: 1, diary_event_id: null },
]

const calls = vi.hoisted(() => ({ checkIn: [] as string[], paid: [] as string[], closed: 0 }))

function show(rows = orders()) {
  render(
    <TicketScanner
      orders={rows}
      dates={dates}
      busy={false}
      onCheckIn={(o) => calls.checkIn.push(o.id)}
      onPaidAndCheckIn={(o) => calls.paid.push(o.id)}
      onClose={() => (calls.closed += 1)}
    />,
  )
  return userEvent.setup()
}

beforeEach(() => {
  cam.onText = null
  calls.checkIn = []
  calls.paid = []
  calls.closed = 0
})

describe('the ticket scanner', () => {
  it('brings up a scanned ticket, says what is owed, and checks them in — paid or not', async () => {
    const user = show()
    expect(screen.getByRole('dialog', { name: 'Scan tickets' })).toBeInTheDocument()
    scan('https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
    const card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText('Valid')).toBeInTheDocument()
    expect(within(card).getByRole('heading', { name: /^Ama Owusu/ })).toHaveTextContent(/2 tickets/)
    expect(within(card).getByText('Awaiting payment')).toBeInTheDocument()
    expect(within(card).getByText('£36.00 still to pay.')).toBeInTheDocument()
    expect(within(card).getByText('For Ama Owusu, Kofi Owusu')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Paid now, check in' }))
    expect(calls.paid).toEqual(['o1'])
    await user.click(within(card).getByRole('button', { name: 'Check in' }))
    expect(calls.checkIn).toEqual(['o1'])
  })

  it('ignores the same code while it stays in view, and moves on to the next', async () => {
    const user = show()
    scan('https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
    scan('https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')
    expect(screen.getAllByRole('region', { name: 'Ticket found' })).toHaveLength(1)
    scan('https://rim-church-app.vercel.app/ticket/BCDEFGHJKMNP')
    const card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText(/Already checked in/)).toBeInTheDocument()
    expect(within(card).getByText('Paid')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Check in' })).toBeNull()
    await user.click(within(card).getByRole('button', { name: 'Next' }))
    expect(screen.queryByRole('region', { name: 'Ticket found' })).toBeNull()
    // After Next, the same ticket again is a fresh scan.
    scan('https://rim-church-app.vercel.app/ticket/BCDEFGHJKMNP')
    expect(screen.getByRole('region', { name: 'Ticket found' })).toBeInTheDocument()
  })

  it('checks a paid ticket in the moment it is read, with no tap', () => {
    show()
    scan('https://rim-church-app.vercel.app/ticket/EFGHJKMNPQRS')
    const card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText('Checked in')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Check in' })).toBeNull()
    expect(calls.checkIn).toEqual(['o-sam'])
  })

  it('checks a ticket in again on the second day of an event, and says so (0254)', () => {
    const yesterday = new Date(Date.now() - 86400000)
    yesterday.setHours(18, 40, 0, 0)
    show([order({ id: 'o-ben', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', quantity: 1, total_pence: 2000, promo_code: null, payment_status: 'received', checked_in_at: yesterday.toISOString(), tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] })])
    scan('https://rim-church-app.vercel.app/ticket/BCDEFGHJKMNP')
    // Paid, and not yet in today: in he goes, no tap.
    expect(calls.checkIn).toEqual(['o-ben'])
    expect(within(screen.getByRole('region', { name: 'Ticket found' })).getByText('Checked in')).toBeInTheDocument()
  })

  it('refuses a cancelled ticket and a code that is not this event’s', () => {
    show()
    scan('https://rim-church-app.vercel.app/ticket/CDEFGHJKMNPQ')
    let card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText('Cancelled — not valid')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Check in' })).toBeNull()
    scan('https://rim-church-app.vercel.app/ticket/ZZZZZZZZZZZZ')
    card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText('Not a ticket for this event')).toBeInTheDocument()
    expect(within(card).getByText('ZZZZZZZZZZZZ')).toBeInTheDocument()
    // Something that is not a ticket link at all brings up nothing new.
    scan('https://example.org/inventory/scan/123')
    expect(within(screen.getByRole('region', { name: 'Ticket found' })).getByText('ZZZZZZZZZZZZ')).toBeInTheDocument()
  })

  it('says when a ticket is for another day, and shows the church’s note', () => {
    show()
    scan('https://rim-church-app.vercel.app/ticket/DEFGHJKMNPQR')
    const card = screen.getByRole('region', { name: 'Ticket found' })
    expect(within(card).getByText(/^For another day: /)).toBeInTheDocument()
    expect(within(card).getByText('Note: Wheelchair space')).toBeInTheDocument()
    expect(within(card).queryByText(/still to pay/)).toBeNull()
    expect(within(card).getByRole('button', { name: 'Check in' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Paid now, check in' })).toBeNull()
  })

  it('takes a typed code too', async () => {
    const user = show()
    const box = screen.getByRole('textbox', { name: 'Ticket code' })
    expect(screen.getByRole('button', { name: 'Find' })).toBeDisabled()
    await user.type(box, 'abcdefghjkmn')
    expect(box).toHaveValue('ABCDEFGHJKMN')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    expect(within(screen.getByRole('region', { name: 'Ticket found' })).getByRole('heading', { name: /^Ama Owusu/ })).toBeInTheDocument()
    expect(box).toHaveValue('')
  })

  it('closes on Done', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(calls.closed).toBe(1)
  })
})
