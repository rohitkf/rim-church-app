import { describe, expect, it } from 'vitest'
import { amountWords, ticketBreakdown } from './registrationBreakdown'
import { orderMoney } from './registrations'
import { pounds } from './money'

type Order = Parameters<typeof ticketBreakdown>[0][number]
const order = (over: Partial<Order> = {}): Order => ({
  status: 'confirmed',
  quantity: 1,
  subtotal_pence: 3000,
  discount_pence: 0,
  total_pence: 3000,
  promo_code: null,
  invite_id: null,
  payment_status: 'awaiting',
  payment_method: null,
  payment_verified_at: null,
  ...over,
})
const times = (n: number, over: Partial<Order>) => Array.from({ length: n }, () => order(over))
const free = (over: Partial<Order> = {}) => order({ discount_pence: 3000, total_pence: 0, payment_status: 'not_needed', ...over })

/** The conference as it stood the evening the Owner asked: 54 orders, 67 tickets, £60 in, £1,230 to come. */
const conference: Order[] = [
  ...times(24, free({ promo_code: 'Rehoboth26' })),
  ...times(6, { payment_status: 'reported', payment_method: 'bank', quantity: 2, subtotal_pence: 6000, total_pence: 6000 }),
  order({ payment_status: 'reported', payment_method: 'bank' }),
  ...times(6, { payment_status: 'reported', payment_method: 'paypal' }),
  order({ payment_status: 'received', payment_method: 'paypal', quantity: 2, subtotal_pence: 6000, total_pence: 6000 }),
  ...times(7, { payment_method: 'reception' }),
  order({ payment_method: 'reception', quantity: 2, subtotal_pence: 6000, total_pence: 6000 }),
  ...times(5, { quantity: 2, subtotal_pence: 6000, total_pence: 6000 }),
  ...times(3, {}),
  // Cancelled: in none of the numbers.
  ...times(4, { status: 'cancelled' }),
]

describe('an event’s tickets, by how each is paid for', () => {
  it('says each scenario with its orders, tickets and money', () => {
    const { groups } = ticketBreakdown(conference)
    expect(groups.map((g) => [g.title, g.orders, g.tickets])).toEqual([
      ['Nothing to pay', 24, 24],
      ['Bank transfer', 7, 13],
      ['Online link', 7, 8],
      ['At reception', 8, 9],
      ['Way of paying not chosen', 8, 13],
    ])
    const said = groups.flatMap((g) => g.lines.map((l) => `${g.title}: ${l.label} · ${l.orders} · ${l.tickets} · ${amountWords(l, pounds)}`))
    expect(said).toEqual([
      'Nothing to pay: Free with code REHOBOTH26 · 24 · 24 · £720.00 off',
      'Bank transfer: Receipt sent, to check · 7 · 13 · £390.00 to come',
      'Online link: Paid, not verified yet · 1 · 2 · £60.00 in',
      'Online link: Receipt sent, to check · 6 · 6 · £180.00 to come',
      'At reception: Not paid yet · 8 · 9 · £270.00 to come',
      'Way of paying not chosen: Not paid yet · 8 · 13 · £390.00 to come',
    ])
  })

  it('adds up to the page’s own numbers: every live registration is in exactly one line', () => {
    const { groups, orders, tickets } = ticketBreakdown(conference)
    const lines = groups.flatMap((g) => g.lines)
    expect(orders).toBe(54)
    expect(tickets).toBe(67)
    expect(lines.reduce((n, l) => n + l.orders, 0)).toBe(54)
    expect(lines.reduce((n, l) => n + l.tickets, 0)).toBe(67)
    // And to the page's money: what is "in" is its received, what is "to come" its still to come.
    const money = orderMoney(conference)
    const sum = (kind: string) => lines.filter((l) => l.money === kind).reduce((n, l) => n + l.pence, 0)
    expect(sum('in')).toBe(money.received)
    expect(sum('to_come')).toBe(money.toCome)
    expect(sum('waived')).toBe(money.waived)
    expect(pounds(money.received)).toBe('£60.00')
    expect(pounds(money.toCome)).toBe('£1230.00')
  })

  it('tells verified from not, wherever the office has got to', () => {
    const at = '2026-11-19T10:00:00Z'
    const { groups } = ticketBreakdown([
      order({ payment_method: 'bank', payment_status: 'received', payment_verified_at: at }),
      order({ payment_method: 'bank', payment_status: 'received' }),
      // Verified by somebody who can see the bank before the office marked it paid (0267).
      order({ payment_method: 'bank', payment_status: 'reported', payment_verified_at: at }),
      order({ payment_method: 'bank', payment_status: 'awaiting', payment_verified_at: at }),
      order({ payment_method: 'bank', payment_status: 'reported' }),
      order({ payment_method: 'bank', payment_status: 'awaiting' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].lines.map((l) => [l.label, l.orders, l.money])).toEqual([
      ['Paid and verified', 1, 'in'],
      ['Paid, not verified yet', 1, 'in'],
      ['Verified, not marked paid yet', 2, 'to_come'],
      ['Receipt sent, to check', 1, 'to_come'],
      ['Not paid yet', 1, 'to_come'],
    ])
  })

  it('keeps each promo code apart, the biggest first, and tells an invite link and a free ticket from a code', () => {
    const { groups } = ticketBreakdown([
      free({ promo_code: 'staff' }),
      ...times(2, free({ promo_code: 'PASTORS' })),
      free({ promo_code: 'Pastors ' }),
      free({ invite_id: 'i1' }),
      order({ subtotal_pence: 0, total_pence: 0, payment_status: 'not_needed' }),
    ])
    expect(groups[0].lines.map((l) => [l.label, l.orders, amountWords(l, pounds)])).toEqual([
      ['Free with code PASTORS', 3, '£90.00 off'],
      ['Free with code STAFF', 1, '£30.00 off'],
      ['Free by an invite link', 1, '£30.00 off'],
      ['Free tickets', 1, ''],
    ])
  })

  it('puts a code that only took some off with how the rest is paid: it is still a payment', () => {
    const { groups } = ticketBreakdown([order({ promo_code: 'HALF', discount_pence: 1500, total_pence: 1500, payment_method: 'bank', payment_status: 'reported' })])
    expect(groups.map((g) => g.title)).toEqual(['Bank transfer'])
    expect(amountWords(groups[0].lines[0], pounds)).toBe('£15.00 to come')
  })

  it('says a waived payment as waived, never as money in', () => {
    const { groups } = ticketBreakdown([order({ payment_status: 'waived', payment_method: 'reception' })])
    expect(groups.map((g) => g.title)).toEqual(['Payment waived'])
    expect(groups[0].lines[0].money).toBe('waived')
    expect(amountWords(groups[0].lines[0], pounds)).toBe('£30.00 waived')
  })

  it('is empty for an event nobody has registered for', () => {
    expect(ticketBreakdown([])).toEqual({ groups: [], orders: 0, tickets: 0 })
    expect(ticketBreakdown(times(2, { status: 'cancelled' })).groups).toEqual([])
  })
})
