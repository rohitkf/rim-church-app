/**
 * Putting an event's registrations in order, for the table.
 *
 * The cards are newest first and always were. A table has columns, and a
 * column with a heading is a thing people press to sort by — the Owner
 * asked for the table to be "fully interactable, with filters and
 * sorting" (November 2026). So each sortable column is a key here, with
 * the way round it starts when first pressed: names from A, money and
 * tickets from the most, the newest registration first. Pressed again it
 * turns round.
 *
 * Two columns are not words or numbers and have an order of their own:
 * **Status** goes by what is owed first — not paid yet, a receipt to
 * check, paid, free, waived, and the cancelled last — and **Payment
 * method** by bank transfer, the online link, at reception, not chosen,
 * and last what has nothing to pay. Both ask `lib/registrationBreakdown`,
 * like the filters and the table of how tickets are paid for.
 *
 * Ties are settled by the newest first, whichever way the column is
 * turned, so a sort by status leaves each status's registrations in the
 * order the cards had them.
 */
import { WAYS, paymentOf, wayOf, type PaymentPlace } from './registrationBreakdown'
import type { OrderRow } from './registrations'

export type SortKey = 'name' | 'tickets' | 'amount' | 'status' | 'method' | 'registered'
export interface OrderSort {
  key: SortKey
  dir: 'asc' | 'desc'
}

/** As the cards are: the newest first. */
export const DEFAULT_SORT: OrderSort = { key: 'registered', dir: 'desc' }

/** The way round a column starts when it is first pressed. */
const FIRST: Record<SortKey, OrderSort['dir']> = { name: 'asc', tickets: 'desc', amount: 'desc', status: 'asc', method: 'asc', registered: 'desc' }

/** What pressing a column's heading gives: that column, its first way round — or turned round, if it was already the one. */
export function nextSort(current: OrderSort, key: SortKey): OrderSort {
  if (current.key !== key) return { key, dir: FIRST[key] }
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
}

const PLACES: PaymentPlace[] = ['awaiting', 'reported', 'received', 'free', 'waived']

type Sorted = Pick<OrderRow, 'name' | 'quantity' | 'total_pence' | 'status' | 'payment_status' | 'payment_method' | 'created_at'>

/** Where a registration comes in the Status column: what is owed first, the cancelled last. */
const statusRank = (o: Sorted) => (o.status === 'cancelled' ? PLACES.length : PLACES.indexOf(paymentOf(o)))
/** Where it comes in the Payment method column: the ways of paying in their order, then what has none. */
const methodRank = (o: Sorted) => {
  const way = o.status === 'confirmed' ? wayOf(o) : null
  return way === null ? WAYS.length : WAYS.indexOf(way)
}

export function sortOrders<T extends Sorted>(orders: readonly T[], sort: OrderSort): T[] {
  const turn = sort.dir === 'asc' ? 1 : -1
  const by = (a: T, b: T): number => {
    switch (sort.key) {
      case 'name':
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
      case 'tickets':
        return a.quantity - b.quantity
      case 'amount':
        return a.total_pence - b.total_pence
      case 'status':
        return statusRank(a) - statusRank(b)
      case 'method':
        return methodRank(a) - methodRank(b)
      case 'registered':
        return a.created_at.localeCompare(b.created_at)
    }
  }
  // The newest first settles a tie, whichever way the column is turned.
  return [...orders].sort((a, b) => by(a, b) * turn || b.created_at.localeCompare(a.created_at))
}
