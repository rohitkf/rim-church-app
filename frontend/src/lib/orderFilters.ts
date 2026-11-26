/**
 * Finding registrations on an event's page: two dropdowns.
 *
 * There was one row of ten filters — All, To pay, Receipts, To verify,
 * Paid, Checked in, Cancelled, Refunds, Undelivered, Same email — which
 * could not say "paid at reception": how somebody pays was nowhere in it,
 * and its words overlapped ("To pay" held the receipts as well). It
 * became three rows of chips, which said everything and was a wall of
 * choices: fifteen buttons, an "All" and an "Any", numbers on each. The
 * Owner asked for something cleaner that is not confusing (November
 * 2026).
 *
 * So there are two questions, each a dropdown that says its answer:
 *
 *   Status          where a registration stands — "All registrations",
 *                   or one thing: its payment (not paid yet, a receipt to
 *                   check, paid, free, waived), something to do about it
 *                   (a payment to verify, a refund, an email that did not
 *                   arrive, the same email twice), or whether they came
 *                   (checked in, cancelled). Headed in the list, so the
 *                   three kinds are told apart.
 *   Payment method  bank transfer, the online link, at reception, or not
 *                   chosen yet. Only what has something to pay has one.
 *
 * Chosen together they narrow: Paid and At reception is who paid at the
 * door. Each choice says, in its list, how many it would show with the
 * other dropdown as it is; one that would show nobody is greyed, and one
 * nobody on the event is in is not listed at all.
 *
 * Underneath, a filter is still three parts (`payment`, `way`, `only`),
 * because the pills under the page's tiles set them and `orderFits` reads
 * them; the Status dropdown sets `payment` or `only`, never both. The
 * first two ask `lib/registrationBreakdown`, so a number here and the
 * same line of "How the tickets are paid for" are the same people.
 */
import { matchScore, tokensOf } from './searchMatch'
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
  { key: 'all', label: 'All registrations' },
  { key: 'awaiting', label: 'Not paid yet' },
  { key: 'reported', label: 'Receipt to check' },
  { key: 'received', label: 'Paid' },
  { key: 'free', label: 'Free' },
  { key: 'waived', label: 'Waived' },
]

/**
 * Where a registration's payment stands, in the words the people who work
 * registrations read: the Status dropdown's own, so the tag on a card, the
 * column in the table, the row at Reception and the filter that finds them
 * all say one thing. (The attendee's ticket has its own words,
 * `PAYMENT_WORDS`: "Receipt sent — being checked" is theirs to read, and
 * "Receipt to check" is the office's to do.)
 */
export const PAYMENT_PLACE_WORDS = Object.fromEntries(PAYMENT_FILTERS.filter((p) => p.key !== 'all').map((p) => [p.key, p.label])) as Record<PaymentPlace, string>
export const paymentWordsOf = (o: Parameters<typeof paymentOf>[0]): string => PAYMENT_PLACE_WORDS[paymentOf(o)]

/** `kind` is the heading it sits under in the Status list: something to do about it, or whether they came. */
export const ONLY_FILTERS: { key: OnlyFilter; label: string; kind: 'todo' | 'came' }[] = [
  { key: 'to_verify', label: 'Payment to verify', kind: 'todo' },
  { key: 'refunds', label: 'Refunds', kind: 'todo' },
  { key: 'email', label: 'Email not delivered', kind: 'todo' },
  { key: 'duplicates', label: 'Same email twice', kind: 'todo' },
  { key: 'checked_in', label: 'Checked in', kind: 'came' },
  { key: 'cancelled', label: 'Cancelled', kind: 'came' },
]

/**
 * What the Status dropdown holds: everybody, one place the payment can
 * stand, or one other thing. One value, so it is one dropdown.
 */
export type StatusChoice = 'all' | `payment:${PaymentPlace}` | `only:${OnlyFilter}`

export function statusOf(f: OrderFilters): StatusChoice {
  // A pill under the tiles can set either; `only` is the narrower, and is what is said.
  return f.only ? `only:${f.only}` : f.payment !== 'all' ? `payment:${f.payment}` : 'all'
}

/** The filters with the Status dropdown set to this, the payment method left as it was. */
export function withStatus(f: OrderFilters, choice: StatusChoice): OrderFilters {
  if (choice.startsWith('payment:')) return { ...f, payment: choice.slice(8) as PaymentPlace, only: null }
  if (choice.startsWith('only:')) return { ...f, payment: 'all', only: choice.slice(5) as OnlyFilter }
  return { ...f, payment: 'all', only: null }
}

/** The Status list's headings, in the order they are read. */
export const STATUS_HEADINGS = { payment: 'Payment', todo: 'To do', came: 'Attendance' } as const

/** The payment methods to choose from, the online link called by its own name. */
export function wayFilters(onlineName?: string): { key: WayFilter; label: string }[] {
  return [{ key: 'any', label: 'Any payment method' }, ...WAYS.map((w) => ({ key: w, label: w === 'none' ? 'Not chosen yet' : wayWords(w, onlineName) }))]
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
  if (tokensOf(query).length === 0) return true
  // A booking code or a promo code is found as written and no other way:
  // one letter out is somebody else's booking, not a slip.
  const written = query.trim().toLowerCase()
  if (o.code.toLowerCase().includes(written) || (o.promo_code ?? '').toLowerCase().includes(written)) return true
  // Everything else by the app's one matcher (lib/searchMatch): names in
  // either order, a slip forgiven, a telephone number however it is spaced.
  return (
    matchScore(query, [
      { text: o.name, weight: 3 },
      { text: o.tickets.map((t) => t.attendee_name ?? '').join(' '), weight: 2 },
      { text: `${o.email ?? ''} ${o.notes ?? ''}` },
      { text: o.phone ?? '' },
    ]) !== null
  )
}

/** One of the filters', and says the words typed. */
export function orderMatches(o: OrderRow, filters: OrderFilters, query: string, duplicates: ReadonlySet<string> = new Set()): boolean {
  return orderFits(o, filters, duplicates) && orderSays(o, query)
}

/**
 * What is chosen, in words, for whoever cannot see the dropdowns: "Paid ·
 * At reception". Empty when nothing is.
 */
export function filterWords(f: OrderFilters, onlineName?: string): string {
  return [
    f.payment === 'all' ? null : PAYMENT_FILTERS.find((p) => p.key === f.payment)!.label,
    f.way === 'any' ? null : wayFilters(onlineName).find((w) => w.key === f.way)!.label,
    f.only ? ONLY_FILTERS.find((o) => o.key === f.only)!.label : null,
  ]
    .filter(Boolean)
    .join(' · ')
}
