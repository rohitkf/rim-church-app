import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderFilterBar } from './OrderFilterBar'
import { NO_FILTERS, orderFits, type OrderFilters } from '../lib/orderFilters'
import { duplicateEmails, type OrderRow } from '../lib/registrations'

let n = 0
const order = (over: Partial<OrderRow> = {}): OrderRow =>
  ({
    id: `o${(n += 1)}`,
    code: `CODE${n}`,
    date_id: null,
    name: `Person ${n}`,
    email: `p${n}@example.org`,
    phone: null,
    quantity: 1,
    subtotal_pence: 3000,
    discount_pence: 0,
    total_pence: 3000,
    promo_code: null,
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
const times = (k: number, over: Partial<OrderRow>) => Array.from({ length: k }, () => order(over))

const orders = [
  ...times(3, { payment_method: 'bank', payment_status: 'reported' }),
  ...times(2, { payment_method: 'paypal', payment_status: 'reported' }),
  order({ payment_method: 'paypal', payment_status: 'received' }),
  ...times(4, { payment_method: 'reception' }),
  ...times(2, { payment_method: 'reception', payment_status: 'received' }),
  ...times(5, {}),
  ...times(6, { promo_code: 'EARLY', discount_pence: 3000, total_pence: 0, payment_status: 'not_needed' }),
  order({ status: 'cancelled' }),
]

function Bar({ onlineName }: { onlineName?: string }) {
  const [filters, setFilters] = useState<OrderFilters>(NO_FILTERS)
  const dupes = duplicateEmails(orders)
  return (
    <>
      <OrderFilterBar orders={orders} duplicates={dupes} filters={filters} onChange={setFilters} onlineName={onlineName} />
      <output>{orders.filter((o) => orderFits(o, filters, dupes)).length}</output>
    </>
  )
}
const labels = (group: HTMLElement) => within(group).getAllByRole(group.getAttribute('role') === 'radiogroup' ? 'radio' : 'button').map((b) => b.textContent)

describe('the filters over an event’s registrations', () => {
  it('asks three things, each with how many it holds, the online link by its own name', () => {
    render(<Bar onlineName="Paypal" />)
    expect(labels(screen.getByRole('radiogroup', { name: 'Payment' }))).toEqual(['All', 'Not paid yet 9', 'Receipt to check 5', 'Paid 3', 'Free 6'])
    expect(labels(screen.getByRole('radiogroup', { name: 'Way of paying' }))).toEqual(['Any', 'Bank transfer 3', 'Paypal 3', 'At reception 6', 'Not chosen 5'])
    // Nobody waived, checked in, owed a refund or bounced: none of those is offered.
    expect(labels(screen.getByRole('group', { name: 'Show only' }))).toEqual(['To verify 8', 'Cancelled 1'])
  })

  it('tells paid at reception from still to pay at reception', async () => {
    const user = userEvent.setup()
    render(<Bar />)
    await user.click(within(screen.getByRole('radiogroup', { name: 'Way of paying' })).getByRole('radio', { name: /At reception/ }))
    expect(screen.getByRole('status')).toHaveTextContent('6')
    // The other row now counts within reception: four still to pay there, two paid there.
    expect(labels(screen.getByRole('radiogroup', { name: 'Payment' }))).toEqual(['All', 'Not paid yet 4', 'Receipt to check 0', 'Paid 2', 'Free 0'])
    await user.click(within(screen.getByRole('radiogroup', { name: 'Payment' })).getByRole('radio', { name: /^Paid/ }))
    expect(screen.getByRole('status')).toHaveTextContent('2')
    await user.click(within(screen.getByRole('radiogroup', { name: 'Payment' })).getByRole('radio', { name: /Not paid yet/ }))
    expect(screen.getByRole('status')).toHaveTextContent('4')
  })

  it('tells a bank transfer’s receipt from the online link’s', async () => {
    const user = userEvent.setup()
    render(<Bar />)
    await user.click(within(screen.getByRole('radiogroup', { name: 'Payment' })).getByRole('radio', { name: /Receipt to check/ }))
    expect(labels(screen.getByRole('radiogroup', { name: 'Way of paying' }))).toEqual(['Any', 'Bank transfer 3', 'Online link 2', 'At reception 0', 'Not chosen 0'])
    await user.click(within(screen.getByRole('radiogroup', { name: 'Way of paying' })).getByRole('radio', { name: /Bank transfer/ }))
    expect(screen.getByRole('status')).toHaveTextContent('3')
  })

  it('lets go of "show only" when it is pressed again', async () => {
    const user = userEvent.setup()
    render(<Bar />)
    const only = screen.getByRole('group', { name: 'Show only' })
    await user.click(within(only).getByRole('button', { name: /Cancelled/ }))
    expect(within(only).getByRole('button', { name: /Cancelled/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('1')
    await user.click(within(only).getByRole('button', { name: /Cancelled/ }))
    expect(within(only).getByRole('button', { name: /Cancelled/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('status')).toHaveTextContent(String(orders.length))
  })

  it('draws no row with nothing to choose: a free event has no way of paying', () => {
    const free = times(2, { total_pence: 0, subtotal_pence: 0, payment_status: 'not_needed' })
    render(<OrderFilterBar orders={free} duplicates={new Set()} filters={NO_FILTERS} onChange={() => {}} />)
    expect(screen.queryByRole('radiogroup', { name: 'Way of paying' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Show only' })).toBeNull()
    expect(labels(screen.getByRole('radiogroup', { name: 'Payment' }))).toEqual(['All', 'Free 2'])
  })
})
