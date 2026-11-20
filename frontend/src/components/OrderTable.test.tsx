import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderTable } from './OrderTable'
import { DEFAULT_SORT, nextSort, sortOrders, type OrderSort } from '../lib/orderSort'
import type { OrderRow } from '../lib/registrations'
import { paymentWordsOf } from '../lib/orderFilters'

const order = (name: string, over: Partial<OrderRow> = {}): OrderRow =>
  ({
    id: name,
    code: `CODE-${name}`,
    date_id: null,
    name,
    email: `${name.toLowerCase()}@example.org`,
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

const people = [
  order('Ben', { created_at: '2026-11-19T09:00:00Z', payment_status: 'received', payment_method: 'bank', quantity: 2, total_pence: 6000, checked_in_at: '2026-11-21T18:00:00Z' }),
  order('Ama', { created_at: '2026-11-19T12:00:00Z', payment_method: 'reception' }),
  order('Dan', { created_at: '2026-11-19T11:00:00Z', payment_status: 'reported', payment_method: 'paypal' }),
  order('Grace', { created_at: '2026-11-19T10:00:00Z', payment_status: 'not_needed', total_pence: 0, promo_code: 'EARLY' }),
  order('Asha', { created_at: '2026-11-19T13:00:00Z', status: 'cancelled', payment_method: 'bank' }),
]

const stepped = vi.fn()
const chosen = vi.fn()
function Table({ busy = false }: { busy?: boolean }) {
  const [sort, setSort] = useState<OrderSort>(DEFAULT_SORT)
  return (
    <OrderTable
      orders={sortOrders(people, sort)}
      sort={sort}
      onSort={(key) => setSort((was) => nextSort(was, key))}
      onlineName="Paypal"
      actionsFor={(o) => [{ label: `Note on ${o.name}`, onSelect: () => chosen(o.name) }]}
      stepsFor={(o) => (o.payment_status === 'reported' ? [{ label: 'Mark as paid', tone: 'primary', onClick: () => stepped(o.name) }] : [])}
      cardFor={(o) => <li key={o.id}>The whole card of {o.name}</li>}
      busy={busy}
    />
  )
}
const names = () =>
  screen
    .getAllByRole('row')
    .map((r) => r.getAttribute('aria-label'))
    .filter((n): n is string => n !== null)
const head = (name: RegExp) => screen.getByRole('columnheader', { name })

describe('an event’s registrations as a table', () => {
  it('says a line about each: who, how many, how much, where it stands, how it is paid and when', () => {
    render(<Table />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent!.replace(/[↑↓]/g, '').trim())).toEqual(['Name', 'Tickets', 'Amount', 'Status', 'Payment method', 'Registered', 'What can be done'])
    const cells = (name: string) =>
      within(screen.getByRole('row', { name }))
        .getAllByRole('cell')
        .slice(0, 4)
        .map((c) => c.textContent)
    // The Status dropdown's own words, and the online link by the church's name for it.
    expect(cells('Ben')).toEqual(['2', '£60.00', 'PaidChecked in', 'Bank transfer'])
    expect(cells('Dan')).toEqual(['1', '£30.00', 'Receipt to check', 'Paypal'])
    expect(cells('Ama')).toEqual(['1', '£30.00', 'Not paid yet', 'At reception'])
    // A waived one is Waived, not "Paid (waived)": nobody paid.
    expect(paymentWordsOf(order('W', { payment_status: 'waived' }))).toBe('Waived')
    // Nothing to pay has no way of paying; neither has a cancelled one.
    expect(cells('Grace')).toEqual(['1', 'Free', 'Free', '—'])
    expect(cells('Asha')).toEqual(['1', '£30.00', 'Cancelled', '—'])
  })

  it('starts the newest first, as the cards are, and says so on its heading', () => {
    render(<Table />)
    expect(names()).toEqual(['Asha', 'Ama', 'Dan', 'Grace', 'Ben'])
    expect(head(/Registered/)).toHaveAttribute('aria-sort', 'descending')
    expect(head(/Name/)).toHaveAttribute('aria-sort', 'none')
  })

  it('is put in order by pressing a heading, and turned round by pressing it again', async () => {
    const user = userEvent.setup()
    render(<Table />)
    await user.click(within(head(/Name/)).getByRole('button'))
    expect(names()).toEqual(['Ama', 'Asha', 'Ben', 'Dan', 'Grace'])
    expect(head(/Name/)).toHaveAttribute('aria-sort', 'ascending')
    expect(head(/Registered/)).toHaveAttribute('aria-sort', 'none')
    await user.click(within(head(/Name/)).getByRole('button'))
    expect(names()).toEqual(['Grace', 'Dan', 'Ben', 'Asha', 'Ama'])
    expect(head(/Name/)).toHaveAttribute('aria-sort', 'descending')
    // Money from the most; status by what is owed first, the cancelled last.
    await user.click(within(head(/Amount/)).getByRole('button'))
    expect(names()[0]).toBe('Ben')
    await user.click(within(head(/Status/)).getByRole('button'))
    expect(names()).toEqual(['Ama', 'Dan', 'Ben', 'Grace', 'Asha'])
  })

  it('does from a row what a card does: its next step as a button, the rest in its menu', async () => {
    const user = userEvent.setup()
    render(<Table />)
    const dan = within(screen.getByRole('row', { name: 'Dan' }))
    await user.click(dan.getByRole('button', { name: 'Mark as paid' }))
    expect(stepped).toHaveBeenCalledWith('Dan')
    // A row with nothing waiting has no such button.
    expect(within(screen.getByRole('row', { name: 'Ama' })).queryByRole('button', { name: 'Mark as paid' })).toBeNull()
    await user.click(dan.getByRole('button', { name: 'Actions for Dan' }))
    await user.click(screen.getByRole('menuitem', { name: 'Note on Dan' }))
    expect(chosen).toHaveBeenCalledWith('Dan')
  })

  it('opens the whole card under a row, and shuts it again', async () => {
    const user = userEvent.setup()
    render(<Table />)
    const open = screen.getByRole('button', { name: 'Show Dan’s details' })
    expect(open).toHaveAttribute('aria-expanded', 'false')
    await user.click(open)
    expect(screen.getByText('The whole card of Dan')).toBeInTheDocument()
    expect(screen.queryByText('The whole card of Ama')).toBeNull()
    const shut = screen.getByRole('button', { name: 'Hide Dan’s details' })
    expect(shut).toHaveAttribute('aria-expanded', 'true')
    // It stays open while the table is put in another order.
    await user.click(within(head(/Name/)).getByRole('button'))
    expect(screen.getByText('The whole card of Dan')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide Dan’s details' }))
    expect(screen.queryByText('The whole card of Dan')).toBeNull()
  })

  it('holds a row’s step while a save is on its way', () => {
    render(<Table busy />)
    expect(within(screen.getByRole('row', { name: 'Dan' })).getByRole('button', { name: 'Mark as paid' })).toBeDisabled()
  })
})
