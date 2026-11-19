import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT, nextSort, sortOrders, type OrderSort } from './orderSort'

type Row = Parameters<typeof sortOrders>[0][number] & { id: string }
const row = (id: string, over: Partial<Row> = {}): Row => ({
  id,
  name: id,
  quantity: 1,
  total_pence: 3000,
  status: 'confirmed',
  payment_status: 'awaiting',
  payment_method: null,
  created_at: '2026-11-19T10:00:00Z',
  ...over,
})

const people: Row[] = [
  row('Ben', { created_at: '2026-11-19T09:00:00Z', payment_status: 'received', payment_method: 'bank', quantity: 2, total_pence: 6000 }),
  row('ama', { created_at: '2026-11-19T12:00:00Z', payment_method: 'reception' }),
  row('Dan', { created_at: '2026-11-19T11:00:00Z', payment_status: 'reported', payment_method: 'paypal' }),
  row('Grace', { created_at: '2026-11-19T10:00:00Z', payment_status: 'not_needed', total_pence: 0 }),
  row('Asha', { created_at: '2026-11-19T13:00:00Z', status: 'cancelled', payment_method: 'bank' }),
  row('Zed', { created_at: '2026-11-19T08:00:00Z' }),
]
const ids = (sort: OrderSort) => sortOrders(people, sort).map((o) => o.id)

describe('putting registrations in order', () => {
  it('is the newest first, as the cards are, until a column is pressed', () => {
    expect(ids(DEFAULT_SORT)).toEqual(['Asha', 'ama', 'Dan', 'Grace', 'Ben', 'Zed'])
  })

  it('sorts names from A whatever their capitals, and turns round', () => {
    expect(ids({ key: 'name', dir: 'asc' })).toEqual(['ama', 'Asha', 'Ben', 'Dan', 'Grace', 'Zed'])
    expect(ids({ key: 'name', dir: 'desc' })).toEqual(['Zed', 'Grace', 'Dan', 'Ben', 'Asha', 'ama'])
  })

  it('sorts money and tickets by the number, the newest first among equals', () => {
    expect(ids({ key: 'amount', dir: 'desc' })).toEqual(['Ben', 'Asha', 'ama', 'Dan', 'Zed', 'Grace'])
    expect(ids({ key: 'amount', dir: 'asc' })).toEqual(['Grace', 'Asha', 'ama', 'Dan', 'Zed', 'Ben'])
    expect(ids({ key: 'tickets', dir: 'desc' })[0]).toBe('Ben')
  })

  it('sorts status by what is owed first, and puts the cancelled last', () => {
    // Not paid yet (newest first), a receipt to check, paid, free, cancelled.
    expect(ids({ key: 'status', dir: 'asc' })).toEqual(['ama', 'Zed', 'Dan', 'Ben', 'Grace', 'Asha'])
    expect(ids({ key: 'status', dir: 'desc' })[0]).toBe('Asha')
  })

  it('sorts payment method by bank, the online link, reception, not chosen, then what has nothing to pay', () => {
    // A cancelled registration has no way of paying to sort by, whatever it once said.
    expect(ids({ key: 'method', dir: 'asc' })).toEqual(['Ben', 'Dan', 'ama', 'Zed', 'Asha', 'Grace'])
  })

  it('does not change the list it was given', () => {
    const before = people.map((o) => o.id)
    sortOrders(people, { key: 'name', dir: 'asc' })
    expect(people.map((o) => o.id)).toEqual(before)
  })
})

describe('pressing a column’s heading', () => {
  it('starts each column the way round it is wanted first', () => {
    expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort(DEFAULT_SORT, 'amount')).toEqual({ key: 'amount', dir: 'desc' })
    expect(nextSort(DEFAULT_SORT, 'tickets')).toEqual({ key: 'tickets', dir: 'desc' })
    expect(nextSort(DEFAULT_SORT, 'status')).toEqual({ key: 'status', dir: 'asc' })
    expect(nextSort({ key: 'name', dir: 'asc' }, 'registered')).toEqual({ key: 'registered', dir: 'desc' })
  })

  it('turns the same column round when it is pressed again', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' })
    expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort(DEFAULT_SORT, 'registered')).toEqual({ key: 'registered', dir: 'asc' })
  })
})
