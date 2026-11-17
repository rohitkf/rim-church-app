import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApplyPromoDialog } from './ApplyPromoDialog'
import type { OrderRow, PromoCode, TicketType } from '../lib/registrations'

/*
 * Putting a promo code on somebody's registration for them (0298): the
 * event's codes, each with what this registration would come to; one that
 * would take nothing off cannot be chosen; pressed with none chosen, it
 * says so.
 */

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: null,
  quantity: 2,
  subtotal_pence: 3500,
  discount_pence: 0,
  total_pence: 3500,
  promo_code: null,
  invite_id: null,
  payment_status: 'awaiting',
  payment_method: null,
  status: 'confirmed',
  checked_in_at: null,
  notes: null,
  anonymised_at: null,
  created_at: '2026-11-16T21:05:00Z',
  tickets: [
    { ticket_type_id: 't-adult', attendee_name: null, unit_price_pence: 2500 },
    { ticket_type_id: 't-child', attendee_name: null, unit_price_pence: 1000 },
  ],
  ...over,
})
const code = (over: Partial<PromoCode>): PromoCode => ({ id: 'p1', event_id: 'e1', code: 'FREE', kind: 'percent', value: 100, ticket_type_ids: [], max_uses: null, uses: 0, active: true, tickets_covered: null, ...over })
const types: TicketType[] = [
  { id: 't-adult', event_id: 'e1', name: 'Adult', description: null, kind: 'paid', price_pence: 2500, min_donation_pence: null, quantity: null, sort_order: 0 },
  { id: 't-child', event_id: 'e1', name: 'Child', description: null, kind: 'paid', price_pence: 1000, min_donation_pence: null, quantity: null, sort_order: 1 },
  { id: 't-vip', event_id: 'e1', name: 'VIP', description: null, kind: 'paid', price_pence: 9000, min_donation_pence: null, quantity: null, sort_order: 2 },
]

let applied: PromoCode[] = []
let closed = 0
function show(codes: PromoCode[], props: { busy?: boolean; error?: string | null; order?: OrderRow } = {}) {
  render(
    <ApplyPromoDialog
      order={props.order ?? order()}
      ticketTypes={types}
      codes={codes}
      busy={props.busy ?? false}
      error={props.error ?? null}
      onApply={(c) => applied.push(c)}
      onClose={() => (closed += 1)}
    />,
  )
  return { user: userEvent.setup(), dialog: screen.getByRole('form', { name: 'A promo code for Ama Owusu’s registration' }) }
}

beforeEach(() => {
  applied = []
  closed = 0
})

describe('putting a promo code on somebody’s registration', () => {
  it('says what they owe, and what each code would leave to pay', () => {
    const { dialog } = show([
      code({ id: 'free', code: 'FREE' }),
      code({ id: 'one', code: 'ONE', tickets_covered: 1 }),
      code({ id: 'five', code: 'FIVER', kind: 'amount', value: 500 }),
    ])
    expect(dialog).toHaveTextContent('They registered without one and owe £35.00.')
    expect(within(dialog).getByRole('radio', { name: /FREE.*100% off.*£35\.00 off: nothing left to pay\./ })).toBeEnabled()
    // One ticket covered: the dearest, the adult's.
    expect(within(dialog).getByRole('radio', { name: /ONE.*100% off, one ticket.*£25\.00 off: £10\.00 left to pay\./ })).toBeEnabled()
    expect(within(dialog).getByRole('radio', { name: /FIVER.*£5\.00 off.*£5\.00 off: £30\.00 left to pay\./ })).toBeEnabled()
  })

  it('applies the code chosen, and names it on the button', async () => {
    const { user, dialog } = show([code({ id: 'free', code: 'FREE' }), code({ id: 'one', code: 'ONE', tickets_covered: 1 })])
    await user.click(within(dialog).getByRole('radio', { name: /^ONE/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Apply ONE' }))
    expect(applied.map((c) => c.code)).toEqual(['ONE'])
  })

  it('pressed with none chosen, says so and applies nothing', async () => {
    const { user, dialog } = show([code({ id: 'free', code: 'FREE' }), code({ id: 'one', code: 'ONE', tickets_covered: 1 })])
    const apply = within(dialog).getByRole('button', { name: 'Apply the code' })
    // Never greyed out for something missing.
    expect(apply).toBeEnabled()
    expect(within(dialog).queryByRole('alert')).toBeNull()
    await user.click(apply)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose which code to put on.')
    expect(applied).toEqual([])
  })

  it('has the only code that does anything already chosen', () => {
    const { dialog } = show([code({ id: 'free', code: 'FREE' })])
    expect(within(dialog).getByRole('radio', { name: /^FREE/ })).toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Apply FREE' })).toBeInTheDocument()
  })

  it('shows a code that takes nothing off these tickets, and will not let it be chosen', async () => {
    const { user, dialog } = show([code({ id: 'vip', code: 'VIPONLY', ticket_type_ids: ['t-vip'] })])
    const useless = within(dialog).getByRole('radio', { name: /VIPONLY.*Takes nothing off the tickets on this registration\./ })
    expect(useless).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Apply the code' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('None of these codes takes anything off this registration.')
    expect(applied).toEqual([])
  })

  it('says so when the event has no code that can be used', async () => {
    const { user, dialog } = show([])
    expect(dialog).toHaveTextContent('This event has no promo code that can be used')
    expect(within(dialog).queryByRole('button', { name: /Apply/ })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(closed).toBe(1)
  })

  it('shows what the database refused, and waits while it is applying', () => {
    const { dialog } = show([code({ id: 'free', code: 'FREE' })], { error: 'That promo code is not valid.', busy: true })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('That promo code is not valid.')
    expect(within(dialog).getByRole('button', { name: 'Applying…' })).toBeDisabled()
  })
})
