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

function Bar({ onlineName, list = orders }: { onlineName?: string; list?: OrderRow[] }) {
  const [filters, setFilters] = useState<OrderFilters>(NO_FILTERS)
  const dupes = duplicateEmails(list)
  return (
    <OrderFilterBar
      orders={list}
      duplicates={dupes}
      filters={filters}
      onChange={setFilters}
      onlineName={onlineName}
      shown={list.filter((o) => orderFits(o, filters, dupes)).length}
      onClear={() => setFilters(NO_FILTERS)}
    />
  )
}

const status = () => screen.getByRole('combobox', { name: 'Status' })
const method = () => screen.getByRole('combobox', { name: 'Payment method' })
/** A dropdown's list as it reads: headings, and each choice with how many it holds. */
const listOf = async (user: ReturnType<typeof userEvent.setup>, box: HTMLElement) => {
  await user.click(box)
  const rows = within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => `${o.textContent!.replace('✓', '').replace(/(\d+)$/, ' $1')}${o.getAttribute('aria-disabled') ? ' (greyed)' : ''}`)
  await user.keyboard('{Escape}')
  return rows
}
const choose = async (user: ReturnType<typeof userEvent.setup>, box: HTMLElement, name: RegExp) => {
  await user.click(box)
  await user.click(screen.getByRole('option', { name }))
}

describe('the filters over an event’s registrations', () => {
  it('is two dropdowns at rest, each saying everybody, and nothing else', () => {
    render(<Bar />)
    expect(status()).toHaveTextContent('All registrations')
    expect(method()).toHaveTextContent('Any payment method')
    // Nothing chosen: no count, no way back to offer.
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull()
  })

  it('lists where a registration can stand under headings, each with how many, and leaves out what nobody is in', async () => {
    const user = userEvent.setup()
    render(<Bar onlineName="Paypal" />)
    expect(await listOf(user, status())).toEqual(['All registrations', 'Not paid yet 9', 'Receipt to check 5', 'Paid 3', 'Free 6', 'Payment to verify 8', 'Cancelled 1'])
    await user.click(status())
    // Nobody waived, checked in, owed a refund or bounced: none of those is listed. "To do" and "Attendance" each have one.
    expect(within(screen.getByRole('listbox')).getByText('Payment')).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).getByText('To do')).toBeInTheDocument()
    expect(within(screen.getByRole('listbox')).getByText('Attendance')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    // The online link by the name the church gave it.
    expect(await listOf(user, method())).toEqual(['Any payment method', 'Bank transfer 3', 'Paypal 3', 'At reception 6', 'Not chosen yet 5'])
  })

  it('tells paid at reception from still to pay at reception', async () => {
    const user = userEvent.setup()
    render(<Bar />)
    await choose(user, method(), /At reception/)
    expect(method()).toHaveTextContent(/^At reception$/)
    expect(screen.getByRole('status')).toHaveTextContent('Showing 6 of 24')
    // The other dropdown now counts within reception, and greys what would show nobody.
    expect(await listOf(user, status())).toEqual([
      'All registrations',
      'Not paid yet 4',
      'Receipt to check 0 (greyed)',
      'Paid 2',
      'Free 0 (greyed)',
      'Payment to verify 2',
      'Cancelled 0 (greyed)',
    ])
    await choose(user, status(), /^Paid/)
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 of 24')
    await choose(user, status(), /Not paid yet/)
    expect(screen.getByRole('status')).toHaveTextContent('Showing 4 of 24')
  })

  it('tells a bank transfer’s receipt from the online link’s', async () => {
    const user = userEvent.setup()
    render(<Bar />)
    await choose(user, status(), /Receipt to check/)
    expect(await listOf(user, method())).toEqual(['Any payment method', 'Bank transfer 3', 'Online link 2', 'At reception 0 (greyed)', 'Not chosen yet 0 (greyed)'])
    await choose(user, method(), /Bank transfer/)
    expect(screen.getByRole('status')).toHaveTextContent('Showing 3 of 24')
  })

  it('tints a dropdown that is narrowing the list, and puts everything back with Clear', async () => {
    const user = userEvent.setup()
    render(<Bar />)
    const resting = status().className
    await choose(user, status(), /Cancelled/)
    expect(status()).toHaveTextContent(/^Cancelled$/)
    expect(status().className).not.toBe(resting)
    expect(status().className).toContain('text-accent-blue-soft')
    // The other one is still at rest.
    expect(method().className).toBe(resting)
    // What is chosen is said for a screen reader, with the count.
    expect(screen.getByRole('status')).toHaveTextContent('Cancelled: Showing 1 of 24')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(status()).toHaveTextContent('All registrations')
    expect(status().className).toBe(resting)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('never lets a choice end in an empty list: one that would show nobody cannot be picked', async () => {
    const user = userEvent.setup()
    render(<Bar />)
    await choose(user, method(), /Bank transfer/)
    // Every bank transfer here has a receipt to check; none is paid.
    await user.click(status())
    const paid = screen.getByRole('option', { name: /^Paid/ })
    expect(paid).toHaveAttribute('aria-disabled', 'true')
    await user.click(paid)
    await user.keyboard('{Escape}')
    expect(status()).toHaveTextContent('All registrations')
    expect(screen.getByRole('status')).toHaveTextContent('Showing 3 of 24')
  })

  it('says the count and offers Clear while something is typed, with no dropdown chosen', () => {
    render(<OrderFilterBar orders={orders} duplicates={new Set()} filters={NO_FILTERS} onChange={() => {}} shown={2} searching onClear={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent(/^Showing 2 of 24$/)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('has no payment-method dropdown for an event where nobody pays', async () => {
    const user = userEvent.setup()
    const free = times(2, { total_pence: 0, subtotal_pence: 0, payment_status: 'not_needed' })
    render(<Bar list={free} />)
    expect(screen.queryByRole('combobox', { name: 'Payment method' })).toBeNull()
    expect(await listOf(user, status())).toEqual(['All registrations', 'Free 2'])
  })
})
