import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RegistrationBreakdown } from './RegistrationBreakdown'
import type { OrderRow } from '../lib/registrations'

let n = 0
const order = (over: Partial<OrderRow> = {}): OrderRow =>
  ({
    id: `o${(n += 1)}`,
    code: `CODE${n}`,
    date_id: null,
    name: 'Somebody',
    email: null,
    phone: null,
    quantity: 1,
    subtotal_pence: 3000,
    discount_pence: 0,
    total_pence: 3000,
    promo_code: null,
    invite_id: null,
    payment_status: 'awaiting',
    payment_method: null,
    status: 'confirmed',
    checked_in_at: null,
    notes: null,
    anonymised_at: null,
    created_at: '2026-11-19T10:00:00Z',
    tickets: [],
    ...over,
  }) as OrderRow

/** A row's cells as text, by the row's own heading. */
const cells = (table: HTMLElement, name: string) =>
  within(within(table).getByRole('row', { name: new RegExp(`^${name}`) }))
    .getAllByRole('cell')
    .map((c) => c.textContent)

describe('how an event’s tickets are paid for', () => {
  it('sets out each scenario with its orders, its tickets and its money', () => {
    render(
      <RegistrationBreakdown
        orders={[
          order({ promo_code: 'rehoboth26', discount_pence: 3000, total_pence: 0, payment_status: 'not_needed' }),
          order({ promo_code: 'REHOBOTH26', discount_pence: 3000, total_pence: 0, payment_status: 'not_needed' }),
          order({ payment_method: 'bank', payment_status: 'reported', quantity: 2, subtotal_pence: 6000, total_pence: 6000 }),
          order({ payment_method: 'paypal', payment_status: 'received' }),
          order({ payment_method: 'paypal', payment_status: 'received', payment_verified_at: '2026-11-19T11:00:00Z' }),
          order({ payment_method: 'reception' }),
          order({}),
          order({ status: 'cancelled' }),
        ]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'How the tickets are paid for' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['How', 'Orders', 'Tickets', 'Money'])

    expect(cells(table, 'Nothing to pay')).toEqual(['2', '2', ''])
    expect(cells(table, 'Free with code REHOBOTH26')).toEqual(['2', '2', '£60.00 off'])
    expect(cells(table, 'Bank transfer')).toEqual(['1', '2', ''])
    expect(cells(table, 'Receipt sent, to check')).toEqual(['1', '2', '£60.00 to come'])
    expect(cells(table, 'Online link')).toEqual(['2', '2', ''])
    expect(cells(table, 'Paid and verified')).toEqual(['1', '1', '£30.00 in'])
    expect(cells(table, 'Paid, not verified yet')).toEqual(['1', '1', '£30.00 in'])
    expect(cells(table, 'At reception')).toEqual(['1', '1', ''])
    expect(cells(table, 'Way of paying not chosen')).toEqual(['1', '1', ''])
    // "Not paid yet" is said twice, once under each way: at reception, and not chosen.
    expect(within(table).getAllByRole('row', { name: /^Not paid yet/ })).toHaveLength(2)
    // The cancelled one is in nothing.
    expect(cells(table, 'All live registrations')).toEqual(['7', '8', ''])
  })

  it('says the money under the line’s name too, where a phone has no room for a fourth column', () => {
    render(<RegistrationBreakdown orders={[order({ payment_method: 'bank', payment_status: 'reported' })]} />)
    const line = screen.getByRole('rowheader', { name: /Receipt sent, to check/ })
    expect(within(line).getByText('£30.00 to come')).toHaveClass('sm:hidden')
  })

  it('draws nothing for an event nobody has registered for', () => {
    const { container } = render(<RegistrationBreakdown orders={[order({ status: 'cancelled' })]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
