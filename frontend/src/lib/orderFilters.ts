/**
 * Finding registrations on an event's page: three plain questions.
 *
 * There was one row of ten filters — All, To pay, Receipts, To verify,
 * Paid, Checked in, Cancelled, Refunds, Undelivered, Same email — and it
 * could not say "paid at reception" or "bank transfers with a receipt to
 * check": how somebody pays was nowhere in it. Its words overlapped too
 * ("To pay" held the receipts as well, so the pill that said 16 awaiting
 * payment opened a list of 29). The Owner asked for filters that are clear
 * and tell bank transfer from the online link from reception, paid from
 * not (November 2026).
 *
 * So the one row is three, each a question with one answer:
 *
 *   Payment        where the money stands — not paid yet, a receipt to
 *                  check, paid, free, waived. Each live registration is
 *                  in exactly one (`paymentOf`).
 *   Way of paying  bank transfer, the online link, at reception, or not
 *                  chosen (`wayOf`). Only what has something to pay has
 *                  one.
 *   Show only      the things that cut across those: to verify, checked
 *                  in, cancelled, refunds, an email that did not arrive,
 *                  the same email twice. One at a time, or none.
 *
 * Chosen together they narrow: Paid and At reception is who paid at the
 * door; Not paid yet and At reception is who said they would. The first
 * two ask `lib/registrationBreakdown`, so a number on a filter and the
 * same line of "How the tickets are paid for" are the same people.
 *
 * The first two are about live registrations: choosing either leaves the
 * cancelled out, which have "Cancelled" under Show only.
 */
import { emailWantsDoing } from './emailDelivery'
import { WAYS, paymentOf, wayOf, wayWords, type PaymentPlace, type Way } from './registrationBreakdown'
import { sharesAnEmail, wantsVerifying, type OrderRow } from './registrations'

export type PaymentFilter = 'all' | PaymentPlace
export type WayFilter = 'any' | Way
export type OnlyFilter = 'to_verify' | 'checked_in' | 'cancelled' | 'refunds' | 'email' | 'duplicates'

export interface OrderFilters {
  payment: PaymentFilter
  way: WayFilter
  only: OnlyFilter | null
}

export const NO_FILTERS: OrderFilters = { payment: 'all', way: 'any', only: null }

/** In the order they are read: what is still owed first. */
export const PAYMENT_FILTERS: { key: PaymentFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Not paid yet' },
  { key: 'reported', label: 'Receipt to check' },
  { key: 'received', label: 'Paid' },
  { key: 'free', label: 'Free' },
  { key: 'waived', label: 'Waived' },
]

export const ONLY_FILTERS: { key: OnlyFilter; label: string }[] = [
  { key: 'to_verify', label: 'To verify' },
  { key: 'checked_in', label: 'Checked in' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'email', label: 'Email not delivered' },
  { key: 'duplicates', label: 'Same email' },
]

/** The ways of paying to choose from, the online link called by its own name. */
export function wayFilters(onlineName?: string): { key: WayFilter; label: string }[] {
  return [{ key: 'any', label: 'Any' }, ...WAYS.map((w) => ({ key: w, label: wayWords(w, onlineName) }))]
}

export const anyFilter = (f: OrderFilters): boolean => f.payment !== 'all' || f.way !== 'any' || f.only !== null

/**
 * Whether an order is one of the filters'. `duplicates` is
 * duplicateEmails() of the whole list: an order cannot say by itself that
 * another shares its address.
 */
export function orderFits(o: OrderRow, filters: OrderFilters, duplicates: ReadonlySet<string> = new Set()): boolean {
  const live = o.status === 'confirmed'
  if (filters.payment !== 'all' && !(live && paymentOf(o) === filters.payment)) return false
  if (filters.way !== 'any' && !(live && wayOf(o) === filters.way)) return false
  switch (filters.only) {
    case null:
      return true
    case 'to_verify':
      return wantsVerifying(o)
    case 'checked_in':
      return live && !!o.checked_in_at
    case 'cancelled':
      return o.status === 'cancelled'
    case 'refunds':
      return !!o.refund_status
    case 'email':
      return emailWantsDoing(o)
    case 'duplicates':
      return sharesAnEmail(o, duplicates)
  }
}

/** Whether an order says the words typed: a name, an email, a code, a phone, a promo code, a note, an attendee. */
export function orderSays(o: OrderRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [o.name, o.email ?? '', o.code, o.phone ?? '', o.promo_code ?? '', o.notes ?? '', ...o.tickets.map((t) => t.attendee_name ?? '')]
  return hay.some((h) => h.toLowerCase().includes(q))
}

/** One of the filters', and says the words typed. */
export function orderMatches(o: OrderRow, filters: OrderFilters, query: string, duplicates: ReadonlySet<string> = new Set()): boolean {
  return orderFits(o, filters, duplicates) && orderSays(o, query)
}

/**
 * What is chosen, in words, for the line above the list: "Paid · At
 * reception", "Receipt to check · Bank transfer · To verify". Empty when
 * nothing is.
 */
export function filterWords(f: OrderFilters, onlineName?: string): string {
  return [
    f.payment === 'all' ? null : PAYMENT_FILTERS.find((p) => p.key === f.payment)!.label,
    f.way === 'any' ? null : wayWords(f.way, onlineName),
    f.only ? ONLY_FILTERS.find((o) => o.key === f.only)!.label : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
