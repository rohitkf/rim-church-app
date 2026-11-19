/**
 * An event's tickets, by how each is paid for.
 *
 * The event's page already says how many orders, how many tickets, what
 * came in and what is still to come — four numbers that do not say *how*.
 * The Owner asked for the tickets split by scenario (November 2026): free
 * by a promo code; paid, receipt sent or still to pay by bank transfer;
 * the same by the online link; at reception; and so on.
 *
 * **Every live registration is in exactly one line**, so the lines add up
 * to the page's own orders and tickets — a breakdown that did not would
 * be two sets of numbers to argue over. Cancelled registrations are in
 * none, as they are in none of the page's numbers.
 *
 * A registration is placed by two things. *How the money comes*: nothing
 * to pay (a code, an invite link, a free ticket), let go by the church
 * (waived), or one of the ways of paying — and "not chosen" is a way of
 * its own, because that is where somebody who registered and went no
 * further sits. *Where it stands*, for one that pays: not paid yet, a
 * receipt sent and waiting to be checked, marked paid, and beside those
 * whether somebody who can see the accounts has verified it (0267) —
 * which can come before the office marks it paid, so that has a line too.
 *
 * Money is never added across kinds, as on the rest of the page: what
 * came in, what is still to come, what was taken off and what was let go
 * are each said as what they are (`money`).
 */
import { METHOD_WORDS, type OrderRow } from './registrations'

/** What a line's amount is: money in, money still to come, a discount taken off, or a payment let go. */
export type AmountKind = 'in' | 'to_come' | 'off' | 'waived'

export interface BreakdownLine {
  key: string
  label: string
  orders: number
  tickets: number
  pence: number
  money: AmountKind
}

export interface BreakdownGroup {
  key: string
  title: string
  orders: number
  tickets: number
  lines: BreakdownLine[]
}

export interface TicketBreakdown {
  groups: BreakdownGroup[]
  orders: number
  tickets: number
}

type Counted = Pick<
  OrderRow,
  'status' | 'quantity' | 'subtotal_pence' | 'discount_pence' | 'total_pence' | 'promo_code' | 'invite_id' | 'payment_status' | 'payment_method' | 'payment_verified_at'
>

/** Where a registration that pays stands, in the order the lines are read: the surest first. */
const STAGES = [
  { key: 'verified', label: 'Paid and verified', money: 'in' },
  { key: 'received', label: 'Paid, not verified yet', money: 'in' },
  { key: 'verified_early', label: 'Verified, not marked paid yet', money: 'to_come' },
  { key: 'reported', label: 'Receipt sent, to check', money: 'to_come' },
  { key: 'awaiting', label: 'Not paid yet', money: 'to_come' },
] as const satisfies readonly { key: string; label: string; money: AmountKind }[]
type Stage = (typeof STAGES)[number]['key']

function stageOf(o: Counted): Stage {
  const verified = !!o.payment_verified_at
  if (o.payment_status === 'received') return verified ? 'verified' : 'received'
  if (verified) return 'verified_early'
  return o.payment_status === 'reported' ? 'reported' : 'awaiting'
}

/** The ways of paying, in the order the groups are drawn; `none` is nobody having said. */
const WAYS = ['bank', 'paypal', 'reception', 'none'] as const
type Way = (typeof WAYS)[number]
const WAY_TITLE: Record<Way, string> = { ...METHOD_WORDS, none: 'Way of paying not chosen' }

export function ticketBreakdown(orders: readonly Counted[]): TicketBreakdown {
  const live = orders.filter((o) => o.status === 'confirmed')
  // Lines are made as they are met and kept by key, so nothing empty is ever drawn.
  const lines = new Map<string, BreakdownLine & { group: string; place: number }>()
  const add = (group: string, place: number, key: string, label: string, money: AmountKind, o: Counted, pence: number) => {
    const line = lines.get(key) ?? { group, place, key, label, money, orders: 0, tickets: 0, pence: 0 }
    line.orders += 1
    line.tickets += o.quantity
    line.pence += pence
    lines.set(key, line)
  }

  for (const o of live) {
    if (o.payment_status === 'waived') {
      add('waived', 0, 'waived', 'Let go by the church', 'waived', o, o.total_pence)
    } else if (o.payment_status === 'not_needed' || o.total_pence <= 0) {
      // A code and an invitation are never both taken (registration_register drops the code).
      const code = o.promo_code?.trim().toUpperCase()
      if (code) add('free', 0, `free-code-${code}`, `Free with code ${code}`, 'off', o, o.discount_pence)
      else if (o.invite_id && o.discount_pence > 0) add('free', 1, 'free-invite', 'Free by an invite link', 'off', o, o.discount_pence)
      else add('free', 2, 'free-ticket', 'Free tickets', 'off', o, 0)
    } else {
      const way: Way = o.payment_method ?? 'none'
      const stage = STAGES.find((s) => s.key === stageOf(o))!
      add(way, STAGES.indexOf(stage), `${way}-${stage.key}`, stage.label, stage.money, o, o.total_pence)
    }
  }

  const titles: [string, string][] = [['free', 'Nothing to pay'], ...WAYS.map((w): [string, string] => [w, WAY_TITLE[w]]), ['waived', 'Payment waived']]
  const groups = titles
    .map(([key, title]) => {
      const own = [...lines.values()]
        .filter((l) => l.group === key)
        // The biggest code first; the stages in their own order.
        .sort((a, b) => a.place - b.place || b.tickets - a.tickets || a.label.localeCompare(b.label))
        .map(({ group: _group, place: _place, ...line }) => line)
      return { key, title, lines: own, orders: own.reduce((n, l) => n + l.orders, 0), tickets: own.reduce((n, l) => n + l.tickets, 0) }
    })
    .filter((g) => g.lines.length > 0)

  return { groups, orders: live.length, tickets: live.reduce((n, o) => n + o.quantity, 0) }
}

/** A line's amount in words: "£390.00 to come", "£720.00 off", "£60.00 in", "£30.00 waived"; nothing for a free ticket. */
export function amountWords(line: Pick<BreakdownLine, 'pence' | 'money'>, pounds: (pence: number) => string): string {
  if (line.money === 'off') return line.pence > 0 ? `${pounds(line.pence)} off` : ''
  return `${pounds(line.pence)} ${line.money === 'in' ? 'in' : line.money === 'waived' ? 'waived' : 'to come'}`
}
