import { z } from 'zod'
import { supabase } from './supabaseClient'
import { checkInDayName, checkInsOf } from './checkInDays'
import { ticketUrl, registerUrl, inviteUrl } from './registrationLinks'
import { fetchInvites, inviteGives, inviteState, inviteUses, type Invite, type InviteState } from './registrationInvites'
import {
  ATTENDANCE_WORDS,
  METHOD_WORDS,
  PAYMENT_WORDS,
  STATUS_WORDS,
  orderMoney,
  receiverName,
  verifierName,
  buildRegistrationWorkbook,
  duplicateEmails,
  fetchRegistrationMessages,
  sharesAnEmail,
  whenWords,
  type OrderRow,
  type RegistrationEventFull,
  type RegistrationMessage,
} from './registrations'
import { sheetMoment, type ExportCell, type ExportSheet } from './volunteerExport'

/*
 * An event's export, with everything in it (the Owner, November 2026:
 * "as detailed as possible [...] Every single details about that person
 * or event etc").
 *
 * `buildRegistrationWorkbook` (lib/registrations) is the accounts' three
 * sheets: every order, every ticket, the sums. They are kept as they are,
 * first and in that order, because people already sort and total them.
 * This adds to them:
 *
 *   - more columns on the end of Orders and Tickets: what was bought,
 *     who is coming, what is still owed, everything that happened to the
 *     email, when it was cancelled and who checked it in;
 *   - a sheet for the event itself, its dates, its ticket types, every
 *     check-in, its promo codes, its invitation links, its agenda and the
 *     messages sent to the organisers.
 *
 * And for whoever keeps the church's books (the Owner: "Does the export
 * in registration have useful information for accountants of church ?? If
 * not, add such info too"), the money worked out rather than left to be
 * worked out — `accountsSheets`, straight after the Summary: the cash
 * position, a ledger a row an order, what came in each day and by which
 * way of paying (to lay beside a bank statement), who took it, income by
 * ticket type after discounts, who still owes, and the refunds.
 *
 * Some of that the page does not hold (who checked somebody in, the
 * messages): `fetchRegistrationExportExtras` reads it when Export is
 * pressed, each part on its own, and names what it could not read so the
 * file says so on its Event sheet rather than going quietly short.
 */

export interface OrderMore {
  cancelled_at: string | null
  checked_in_by: string | null
  check_ins: { on_date: string; checked_in_at: string; checked_in_by: string | null }[]
}

export interface RegistrationExportExtras {
  /** By order id: when it was cancelled, who checked it in, and each day's check-in with who did it. */
  more?: Record<string, OrderMore>
  /** People's names by user id: whoever checked somebody in or dealt with a message. */
  names?: Record<string, string>
  invites?: Invite[]
  messages?: RegistrationMessage[]
  /** What could not be read, in words. */
  leftOut?: string[]
  /** Where the public pages are, for the links. */
  origin?: string
  /** The moment of the export; now unless a test says otherwise. */
  now?: Date
}

const moreSchema = z.array(
  z.object({
    id: z.string(),
    cancelled_at: z.string().nullable(),
    checked_in_by: z.string().nullable(),
    check_ins: z
      .array(z.object({ on_date: z.string(), checked_in_at: z.string(), checked_in_by: z.string().nullable() }))
      .nullable()
      .transform((v) => v ?? []),
  }),
)

async function fetchOrderMore(eventId: string): Promise<Record<string, OrderMore>> {
  const { data, error } = await supabase
    .from('registration_orders')
    .select('id, cancelled_at, checked_in_by, check_ins:registration_check_ins(on_date, checked_in_at, checked_in_by)')
    .eq('event_id', eventId)
  if (error) throw error
  return Object.fromEntries(moreSchema.parse(data ?? []).map(({ id, ...rest }) => [id, rest]))
}

const nameSchema = z.array(z.object({ id: z.string(), first_name: z.string().nullable(), last_name: z.string().nullable() }))

async function fetchNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {}
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids)
  if (error) throw error
  return Object.fromEntries(nameSchema.parse(data ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ')]))
}

/** Read what the page does not hold, each part on its own. `office` is whether the reader runs registrations. */
export async function fetchRegistrationExportExtras(eventId: string, office: boolean): Promise<RegistrationExportExtras> {
  const leftOut: string[] = []
  const part = async <T>(wanted: boolean, read: () => Promise<T>, name: string): Promise<T | undefined> => {
    if (!wanted) return undefined
    try {
      return await read()
    } catch (err) {
      console.error(`export: ${name} could not be read`, err)
      leftOut.push(name)
      return undefined
    }
  }
  const [more, invites, messages] = await Promise.all([
    part(true, () => fetchOrderMore(eventId), 'who checked people in and when orders were cancelled'),
    part(office, () => fetchInvites(eventId), 'the invitation links'),
    part(office, () => fetchRegistrationMessages(eventId), 'the messages to the organisers'),
  ])
  const ids = new Set<string>()
  for (const m of Object.values(more ?? {})) {
    if (m.checked_in_by) ids.add(m.checked_in_by)
    for (const c of m.check_ins) if (c.checked_in_by) ids.add(c.checked_in_by)
  }
  for (const m of messages ?? []) if (m.handled_by) ids.add(m.handled_by)
  const names = await part(ids.size > 0, () => fetchNames([...ids]), 'the names of who checked people in')
  return { more, invites, messages, names, leftOut, origin: typeof window === 'undefined' ? undefined : window.location.origin }
}

const INVITE_STATE_WORDS: Record<InviteState, string> = { live: 'Live', off: 'Turned off', ended: 'Past its date', used: 'Used up', removed: 'Removed' }
const KIND_WORDS = { free: 'Free', paid: 'Paid', donation: 'Donation' } as const

const money = (pence: number) => Math.round(pence) / 100
const yesNo = (v: boolean) => (v ? 'Yes' : 'No')

/** The day of a moment in the reader's own clock: "2026-11-22"; blank when there is none. */
const dayOf = (iso: string | null | undefined): string => sheetMoment(iso).slice(0, 10)

/** The ways money comes in, in the order the sheets list them; `none` is a payment with no way recorded. */
const WAYS = ['bank', 'paypal', 'reception', 'none'] as const
type Way = (typeof WAYS)[number]
const WAY_WORDS: Record<Way, string> = { ...METHOD_WORDS, none: 'No way recorded' }
const wayOf = (o: Pick<OrderRow, 'payment_method'>): Way => o.payment_method ?? 'none'

/**
 * One order's money, as the books need it: what was charged, what the
 * office marked as received, what was given back, and what is left.
 *
 * `received` is whatever was marked received, on a live order or one
 * cancelled since: it came in either way. A refund is the whole order
 * (the app has no part refunds). `held` is what is in the church's hands
 * now; `income` is what stays once a refund still owed is paid.
 */
export function orderLedger(o: Pick<OrderRow, 'status' | 'total_pence' | 'payment_status' | 'refund_status'>) {
  const live = o.status === 'confirmed'
  const received = o.payment_status === 'received' ? o.total_pence : 0
  const refunded = o.refund_status === 'refunded' ? o.total_pence : 0
  const refundOwed = o.refund_status === 'owed' ? o.total_pence : 0
  // Given back only out of what came in: a refund of a payment never marked received takes nothing from the till.
  const held = Math.max(0, received - refunded)
  return {
    charged: live ? o.total_pence : 0,
    received,
    outstanding: live && (o.payment_status === 'awaiting' || o.payment_status === 'reported') ? o.total_pence : 0,
    waived: live && o.payment_status === 'waived' ? o.total_pence : 0,
    refunded,
    refundOwed,
    held,
    income: Math.max(0, held - (received > 0 ? refundOwed : 0)),
    /** Something the books should look at twice, in words; blank when there is nothing. */
    note:
      refunded > 0 && received === 0
        ? 'Refunded, but the payment was never marked received'
        : refundOwed > 0 && received === 0
          ? 'A refund is owed on a payment that was reported but never confirmed'
          : '',
  }
}

/**
 * What each ticket of an order was charged, in pence: the order's total
 * shared across its tickets in proportion to their prices, so a discount
 * on the order comes off each ticket's type. The shares add up to the
 * total exactly (the odd pence go to the dearest tickets first).
 */
export function chargedPerTicket(o: Pick<OrderRow, 'total_pence' | 'tickets'>): number[] {
  const prices = o.tickets.map((t) => t.unit_price_pence)
  const sum = prices.reduce((a, b) => a + b, 0)
  if (sum <= 0 || prices.length === 0) return prices.map(() => 0)
  const exact = prices.map((price) => (o.total_pence * price) / sum)
  const shares = exact.map(Math.floor)
  let left = o.total_pence - shares.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x), price: prices[i] })).sort((a, b) => b.frac - a.frac || b.price - a.price || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    shares[i] += 1
    left -= 1
  }
  return shares
}

/**
 * The money, for whoever keeps the books. Every figure is in pounds, as a
 * number, and dates are written so they sort. Figures that are different
 * kinds of thing (in the bank, still to come, let go) are never added
 * together into one.
 */
export function accountsSheets(full: RegistrationEventFull, orders: OrderRow[], now: Date = new Date()): ExportSheet[] {
  const { ticketTypes } = full
  const live = orders.filter((o) => o.status === 'confirmed')
  const gone = orders.filter((o) => o.status !== 'confirmed')
  const ledgers = new Map(orders.map((o) => [o.id, orderLedger(o)]))
  const led = (o: OrderRow) => ledgers.get(o.id)!
  const total = (list: OrderRow[], pick: (l: ReturnType<typeof orderLedger>) => number) => list.reduce((n, o) => n + pick(led(o)), 0)
  const sums = orderMoney(orders)
  const paid = orders.filter((o) => led(o).received > 0)
  const verified = paid.filter((o) => !!o.payment_verified_at)
  const receivedAll = total(orders, (l) => l.received)
  const refundedAll = total(orders, (l) => l.refunded)
  const heldAll = total(orders, (l) => l.held)
  const owedOnReceived = orders.filter((o) => led(o).received > 0).reduce((n, o) => n + led(o).refundOwed, 0)
  const owedOnReported = total(orders, (l) => l.refundOwed) - owedOnReceived
  const line = (label: string, value: ExportCell, note: string = ''): ExportCell[] => [label, value, note]
  const gap = (): ExportCell[] => ['', '', '']

  const moneySheet: ExportSheet = {
    name: 'Money',
    columns: [
      { label: 'Figure', width: 54 },
      { label: 'Amount (£)', width: 14 },
      { label: 'What it is', width: 70 },
    ],
    rows: [
      line('LIVE REGISTRATIONS', '', 'Registrations that have not been cancelled.'),
      line('Value before discounts', money(live.reduce((n, o) => n + o.subtotal_pence, 0)), 'Every ticket at its listed price.'),
      line('Discounts given', money(live.reduce((n, o) => n + o.discount_pence, 0)), 'Promo codes and invitation links.'),
      line('Charged', money(total(live, (l) => l.charged)), 'Value before discounts, less discounts. The three lines below add up to this.'),
      line('  Received', money(sums.received), 'Marked as received by the office or at reception.'),
      line('  Still to come', money(sums.toCome), 'Not paid yet, or a receipt sent and still being checked.'),
      line('  Waived', money(sums.waived), 'Let go by the church. Not money.'),
      line('  of Still to come: receipt sent, being checked', money(live.filter((o) => o.payment_status === 'reported').reduce((n, o) => n + o.total_pence, 0)), 'They say they have paid; nobody has confirmed it yet.'),
      gap(),
      line('CANCELLED REGISTRATIONS', '', ''),
      line('Received on registrations since cancelled', money(total(gone, (l) => l.received)), 'Came in before the registration was cancelled.'),
      line('Refunded', money(refundedAll), 'Given back.'),
      line('Refunds still owed', money(owedOnReceived + owedOnReported), 'To be given back.'),
      line('  of which on money marked received', money(owedOnReceived), ''),
      line('  of which on a payment only reported', money(owedOnReported), 'Check whether the money came in before refunding it.'),
      gap(),
      line('CASH POSITION', '', ''),
      line('Total received, every registration', money(receivedAll), 'Live and cancelled alike: everything marked as received.'),
      line('Less refunded', money(refundedAll), ''),
      line('Money held now', money(heldAll), 'What should be in the bank and the cash box for this event.'),
      line('Less refunds still owed on money received', money(owedOnReceived), ''),
      line('Income to keep', money(total(orders, (l) => l.income)), 'What stays with the church once the refunds owed are paid.'),
      gap(),
      line('CHECKED AGAINST THE BANK', '', 'Of everything received, live and cancelled.'),
      line('Received and verified', money(total(verified, (l) => l.received)), 'Somebody who can see the accounts confirmed it arrived.'),
      line('Received, not yet verified', money(receivedAll - total(verified, (l) => l.received)), 'Marked received, not yet matched to the bank or the takings.'),
      gap(),
      line('RECEIVED, BY WAY OF PAYING', '', 'Of everything received, live and cancelled.'),
      ...WAYS.map((w) => line(`  ${WAY_WORDS[w]}`, money(total(paid.filter((o) => wayOf(o) === w), (l) => l.received)), '')),
      gap(),
      line('Registrations', orders.length, `${live.length} live, ${gone.length} cancelled.`),
      line('Income by ticket type', '', 'An order’s discount is shared across its tickets in proportion to their prices.'),
      line('Exported', sheetMoment(now.toISOString()), 'Figures are as they stood at this moment.'),
    ],
  }

  const ledgerSheet: ExportSheet = {
    name: 'Accounts',
    columns: [
      { label: 'Code', width: 14 },
      { label: 'Name', width: 24 },
      { label: 'Registered on', width: 12 },
      { label: 'Status', width: 11 },
      { label: 'Tickets', width: 8 },
      { label: 'Before discount (£)', width: 14 },
      { label: 'Discount (£)', width: 12 },
      { label: 'Promo code', width: 12 },
      { label: 'Charged (£)', width: 12 },
      { label: 'Payment', width: 28 },
      { label: 'Paid by', width: 16 },
      { label: 'Paid on', width: 12 },
      { label: 'Received (£)', width: 12 },
      { label: 'Taken by', width: 20 },
      { label: 'Reference', width: 20 },
      { label: 'Verified', width: 9 },
      { label: 'Verified on', width: 12 },
      { label: 'Verified by', width: 20 },
      { label: 'Still to come (£)', width: 14 },
      { label: 'Waived (£)', width: 11 },
      { label: 'Refund owed (£)', width: 14 },
      { label: 'Refunded (£)', width: 12 },
      { label: 'Refunded on', width: 12 },
      { label: 'Refunded by', width: 20 },
      { label: 'Money held (£)', width: 14 },
      { label: 'Income to keep (£)', width: 16 },
      { label: 'To look at', width: 50 },
    ],
    rows: orders
      .slice()
      // In the order the money came in, the unpaid after: the order a statement is read in.
      .sort((a, b) => (dayOf(a.received_at) || '9999').localeCompare(dayOf(b.received_at) || '9999') || a.created_at.localeCompare(b.created_at))
      .map((o) => {
        const l = led(o)
        return [
          o.code,
          o.name,
          dayOf(o.created_at),
          o.status === 'cancelled' ? 'Cancelled' : 'Registered',
          o.quantity,
          money(o.subtotal_pence),
          money(o.discount_pence),
          o.promo_code ?? '',
          money(o.total_pence),
          PAYMENT_WORDS[o.payment_status],
          o.payment_method ? METHOD_WORDS[o.payment_method] : '',
          l.received > 0 ? dayOf(o.received_at) : '',
          money(l.received),
          l.received > 0 ? receiverName(o) : '',
          o.proof_reference ?? '',
          l.received > 0 ? yesNo(!!o.payment_verified_at) : '',
          dayOf(o.payment_verified_at),
          verifierName(o),
          money(l.outstanding),
          money(l.waived),
          money(l.refundOwed),
          money(l.refunded),
          dayOf(o.refund_at),
          [o.refunder?.first_name, o.refunder?.last_name].filter(Boolean).join(' '),
          money(l.held),
          money(l.income),
          l.note,
        ]
      }),
  }

  // What came in, and what went back, each day: to lay beside a bank statement.
  const days = new Map<string, { in: Record<Way, number>; payments: number; refunded: number; refunds: number }>()
  const dayRow = (key: string) => {
    if (!days.has(key)) days.set(key, { in: { bank: 0, paypal: 0, reception: 0, none: 0 }, payments: 0, refunded: 0, refunds: 0 })
    return days.get(key)!
  }
  const NO_DATE = 'No date recorded'
  for (const o of paid) {
    const row = dayRow(dayOf(o.received_at) || NO_DATE)
    row.in[wayOf(o)] += led(o).received
    row.payments += 1
  }
  for (const o of orders.filter((x) => led(x).refunded > 0)) {
    const row = dayRow(dayOf(o.refund_at) || NO_DATE)
    row.refunded += led(o).refunded
    row.refunds += 1
  }
  const byDaySheet: ExportSheet = {
    name: 'Money by day',
    columns: [
      { label: 'Day', width: 16 },
      ...WAYS.map((w) => ({ label: `${WAY_WORDS[w]} (£)`, width: 16 })),
      { label: 'Received (£)', width: 13 },
      { label: 'Payments', width: 10 },
      { label: 'Refunded (£)', width: 13 },
      { label: 'Refunds', width: 9 },
      { label: 'Net (£)', width: 11 },
    ],
    rows: [...days.entries()]
      .sort(([a], [b]) => (a === NO_DATE ? 1 : b === NO_DATE ? -1 : a.localeCompare(b)))
      .map(([day, d]) => {
        const received = WAYS.reduce((n, w) => n + d.in[w], 0)
        return [day, ...WAYS.map((w) => money(d.in[w])), money(received), d.payments, money(d.refunded), d.refunds, money(received - d.refunded)]
      }),
  }

  // Who took the money, by which way: the cash handled at reception has a name against it.
  const takers = new Map<string, { who: string; way: Way; payments: number; pence: number }>()
  for (const o of paid) {
    const who = receiverName(o) || 'Nobody named'
    const key = `${who}|${wayOf(o)}`
    const row = takers.get(key) ?? { who, way: wayOf(o), payments: 0, pence: 0 }
    row.payments += 1
    row.pence += led(o).received
    takers.set(key, row)
  }
  const takenBySheet: ExportSheet = {
    name: 'Taken by',
    columns: [
      { label: 'Marked received by', width: 24 },
      { label: 'Way of paying', width: 18 },
      { label: 'Payments', width: 10 },
      { label: 'Received (£)', width: 13 },
    ],
    rows: [...takers.values()]
      .sort((a, b) => a.who.localeCompare(b.who) || WAYS.indexOf(a.way) - WAYS.indexOf(b.way))
      .map((t) => [t.who, WAY_WORDS[t.way], t.payments, money(t.pence)]),
  }

  // Income by ticket type, an order's discount shared across its tickets by price.
  const byType = new Map<string, { tickets: number; listed: number; charged: number; received: number; toCome: number; waived: number }>()
  for (const o of live) {
    const shares = chargedPerTicket(o)
    o.tickets.forEach((t, i) => {
      const row = byType.get(t.ticket_type_id) ?? { tickets: 0, listed: 0, charged: 0, received: 0, toCome: 0, waived: 0 }
      row.tickets += 1
      row.listed += t.unit_price_pence
      row.charged += shares[i]
      if (o.payment_status === 'received') row.received += shares[i]
      else if (o.payment_status === 'waived') row.waived += shares[i]
      else if (o.payment_status === 'awaiting' || o.payment_status === 'reported') row.toCome += shares[i]
      byType.set(t.ticket_type_id, row)
    })
  }
  const typeIds = [...ticketTypes.map((t) => t.id), ...[...byType.keys()].filter((id) => !ticketTypes.some((t) => t.id === id))]
  const typeSheet: ExportSheet = {
    name: 'Income by ticket type',
    columns: [
      { label: 'Ticket type', width: 24 },
      { label: 'Tickets', width: 9 },
      { label: 'At listed price (£)', width: 16 },
      { label: 'Discount share (£)', width: 16 },
      { label: 'Charged (£)', width: 12 },
      { label: 'Received (£)', width: 13 },
      { label: 'Still to come (£)', width: 15 },
      { label: 'Waived (£)', width: 11 },
    ],
    rows: typeIds.map((id) => {
      const r = byType.get(id) ?? { tickets: 0, listed: 0, charged: 0, received: 0, toCome: 0, waived: 0 }
      return [ticketTypes.find((t) => t.id === id)?.name ?? 'Ticket', r.tickets, money(r.listed), money(r.listed - r.charged), money(r.charged), money(r.received), money(r.toCome), money(r.waived)]
    }),
  }

  const sheets: ExportSheet[] = [moneySheet, ledgerSheet, byDaySheet]
  if (takers.size > 0) sheets.push(takenBySheet)
  sheets.push(typeSheet)

  const owing = live.filter((o) => led(o).outstanding > 0)
  if (owing.length > 0) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const daysSince = (iso: string) => {
      const d = new Date(iso)
      return Math.max(0, Math.round((midnight - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000))
    }
    sheets.push({
      name: 'Outstanding',
      columns: [
        { label: 'Code', width: 14 },
        { label: 'Name', width: 24 },
        { label: 'Email', width: 28 },
        { label: 'Phone', width: 16 },
        { label: 'Registered on', width: 12 },
        { label: 'Days since', width: 10 },
        { label: 'Owed (£)', width: 11 },
        { label: 'Where it stands', width: 28 },
        { label: 'Way chosen', width: 16 },
        { label: 'Reference given', width: 20 },
        { label: 'Receipt sent on', width: 14 },
      ],
      rows: owing
        .slice()
        // The longest owed first.
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((o) => [
          o.code,
          o.name,
          o.email ?? '',
          o.phone ?? '',
          dayOf(o.created_at),
          daysSince(o.created_at),
          money(led(o).outstanding),
          PAYMENT_WORDS[o.payment_status],
          o.payment_method ? METHOD_WORDS[o.payment_method] : 'Not chosen',
          o.proof_reference ?? '',
          dayOf(o.proof_at),
        ]),
    })
  }

  const refunds = orders.filter((o) => !!o.refund_status)
  if (refunds.length > 0) {
    sheets.push({
      name: 'Refunds',
      columns: [
        { label: 'Code', width: 14 },
        { label: 'Name', width: 24 },
        { label: 'Email', width: 28 },
        { label: 'Amount (£)', width: 12 },
        { label: 'Stands', width: 10 },
        { label: 'Paid by', width: 16 },
        { label: 'Paid on', width: 12 },
        { label: 'Reference', width: 20 },
        { label: 'Bank details for it sent on', width: 18 },
        { label: 'Refunded on', width: 12 },
        { label: 'Refunded by', width: 20 },
        { label: 'To look at', width: 50 },
      ],
      rows: refunds
        .slice()
        // What is still to do first, then what was done, oldest first.
        .sort((a, b) => (a.refund_status === 'owed' ? 0 : 1) - (b.refund_status === 'owed' ? 0 : 1) || (a.refund_at ?? a.created_at).localeCompare(b.refund_at ?? b.created_at))
        .map((o) => [
          o.code,
          o.name,
          o.email ?? '',
          money(o.total_pence),
          o.refund_status === 'owed' ? 'Owed' : 'Refunded',
          o.payment_method ? METHOD_WORDS[o.payment_method] : '',
          dayOf(o.received_at),
          o.proof_reference ?? '',
          dayOf(o.refund_details?.created_at),
          dayOf(o.refund_at),
          [o.refunder?.first_name, o.refunder?.last_name].filter(Boolean).join(' '),
          led(o).note,
        ]),
    })
  }

  return sheets
}

/** Columns added to the right of a sheet, a value a row. */
function widen(sheet: ExportSheet, columns: { label: string; width: number }[], cells: ExportCell[][]): ExportSheet {
  return { ...sheet, columns: [...sheet.columns, ...columns], rows: sheet.rows.map((row, i) => [...row, ...(cells[i] ?? columns.map(() => ''))]) }
}

/** The whole export: the accounts' three sheets, widened, and a sheet for everything else. */
export function buildFullRegistrationWorkbook(
  full: RegistrationEventFull,
  orders: OrderRow[],
  inviteNames: Record<string, string> = {},
  extras: RegistrationExportExtras = {},
): ExportSheet[] {
  const { event, dates, ticketTypes, promoCodes } = full
  const [ordersSheet, ticketsSheet, summary] = buildRegistrationWorkbook(full, orders, inviteNames)
  const origin = extras.origin
  const typeName = (id: string) => ticketTypes.find((t) => t.id === id)?.name ?? 'Ticket'
  const who = (id: string | null | undefined) => (id ? (extras.names?.[id] ?? '') : '')
  const confirmed = orders.filter((o) => o.status === 'confirmed')
  const duplicates = duplicateEmails(orders)
  const owed = (o: OrderRow) => (o.status === 'confirmed' && (o.payment_status === 'awaiting' || o.payment_status === 'reported') ? money(o.total_pence) : 0)

  /** "2 × Adult, 1 × Child": what an order bought, in the order the types are listed. */
  const bought = (o: OrderRow) =>
    ticketTypes
      .map((t) => ({ name: t.name, n: o.tickets.filter((x) => x.ticket_type_id === t.id).length }))
      .filter((x) => x.n > 0)
      .map((x) => `${x.n} × ${x.name}`)
      .join(', ')

  const moreColumns = extras.more
    ? [
        { label: 'Cancelled at', width: 17 },
        { label: 'Checked in by', width: 20 },
      ]
    : []
  const fullOrders = widen(
    ordersSheet,
    [
      { label: 'Ticket types', width: 30 },
      { label: 'Attendees', width: 36 },
      { label: 'Still to pay (£)', width: 12 },
      { label: 'Email sent', width: 17 },
      { label: 'Email status at', width: 17 },
      { label: 'Email problem', width: 36 },
      { label: 'Email changed at', width: 17 },
      { label: 'Email changed by', width: 20 },
      { label: 'Email before', width: 28 },
      { label: 'Receipt sent at', width: 17 },
      { label: 'Receipt file', width: 10 },
      { label: 'Refund details sent', width: 17 },
      ...moreColumns,
      { label: 'Shares an email', width: 12 },
      { label: 'Details removed at', width: 17 },
      { label: 'Ticket link', width: 44 },
    ],
    orders.map((o) => {
      const more = extras.more?.[o.id]
      return [
        bought(o),
        o.tickets.map((t) => t.attendee_name?.trim()).filter(Boolean).join(', '),
        owed(o),
        sheetMoment(o.email_sent_at),
        sheetMoment(o.email_status_at),
        o.email_status_detail ?? '',
        sheetMoment(o.email_changed_at),
        // Changed with nobody named: by the attendee, from their ticket.
        o.email_changed_at ? [o.changer?.first_name, o.changer?.last_name].filter(Boolean).join(' ') || 'The attendee' : '',
        o.email_before?.email ?? '',
        sheetMoment(o.proof_at),
        o.proof_path ? 'Yes' : '',
        sheetMoment(o.refund_details?.created_at),
        ...(extras.more ? [sheetMoment(more?.cancelled_at), who(more?.checked_in_by)] : []),
        sharesAnEmail(o, duplicates) ? 'Yes' : '',
        sheetMoment(o.anonymised_at),
        o.anonymised_at ? '' : ticketUrl(o.code, origin),
      ]
    }),
  )

  const fullTickets = widen(
    ticketsSheet,
    [
      { label: 'Email', width: 28 },
      { label: 'Phone', width: 16 },
      { label: 'Paid', width: 8 },
      { label: 'Checked in', width: 17 },
    ],
    orders.flatMap((o) =>
      o.tickets.map(() => [o.email ?? '', o.phone ?? '', o.payment_status === 'received' || o.payment_status === 'waived' || o.payment_status === 'not_needed' ? 'Yes' : 'No', sheetMoment(o.checked_in_at)]),
    ),
  )

  const line = (label: string, value: ExportCell): ExportCell[] => [label, value]
  const eventSheet: ExportSheet = {
    name: 'Event',
    columns: [
      { label: 'Detail', width: 30 },
      { label: 'Value', width: 70 },
    ],
    rows: [
      line('Event', event.title),
      line('Status', event.cancelled_at ? 'Cancelled' : STATUS_WORDS[event.status]),
      ...(event.cancelled_at ? [line('Cancelled at', sheetMoment(event.cancelled_at)), line('Why it was cancelled', event.cancel_note ?? '')] : []),
      line('Public page', registerUrl(event.slug, origin)),
      line('Attendance', event.attendance ? ATTENDANCE_WORDS[event.attendance] : ''),
      line('Venue', event.location_name ?? ''),
      line('Address', event.address ?? ''),
      line('Map position', event.latitude !== null && event.longitude !== null ? `${event.latitude}, ${event.longitude}` : ''),
      line('Online link', event.join_url ?? ''),
      line('Online details', event.join_details ?? ''),
      line('Dates', dates.map((d) => [d.label?.trim(), whenWords(d.starts_at, d.ends_at)].filter(Boolean).join(': ')).join('; ')),
      line('A booking is for', event.date_mode === 'all' ? 'Every date' : 'One date, chosen when registering'),
      line('Registration opens', sheetMoment(event.registration_opens_at)),
      line('Registration closes', sheetMoment(event.registration_closes_at)),
      line('Tickets in one order', event.min_per_order === event.max_per_order ? event.min_per_order : `${event.min_per_order} to ${event.max_per_order}`),
      line('Can pay at reception', yesNo(event.allow_pay_at_reception)),
      line('Uses the church’s giving details', yesNo(event.payment_use_church_giving)),
      line('Payment links', event.payment_links.map((l) => `${l.label}: ${l.url}`).join('; ')),
      line(
        'Bank accounts',
        event.payment_accounts
          .map((a) => [a.label, a.account_name, a.bank_name, a.sort_code && `sort code ${a.sort_code}`, a.account_number && `account ${a.account_number}`, a.iban && `IBAN ${a.iban}`, a.bic && `BIC ${a.bic}`].filter(Boolean).join(', '))
          .join('; '),
      ),
      line('Payment note', event.payment_note ?? ''),
      line('In the church diary', yesNo(event.add_to_diary)),
      line('Description', event.description ?? ''),
      line('Made', sheetMoment(event.created_at)),
      line('Last changed', sheetMoment(event.updated_at)),
      line('Orders', orders.length),
      line('Registered orders', confirmed.length),
      line('Tickets', confirmed.reduce((n, o) => n + o.quantity, 0)),
      line('Exported', sheetMoment((extras.now ?? new Date()).toISOString())),
      ...(extras.leftOut && extras.leftOut.length > 0 ? [line('Left out of this export (could not be read)', extras.leftOut.join('; '))] : []),
    ],
  }

  // A booking for every date counts on each; one for a chosen date counts on that one.
  const onDate = (dateId: string) => confirmed.filter((o) => event.date_mode === 'all' || o.date_id === dateId)
  const localDay = (iso: string) => sheetMoment(iso).slice(0, 10)
  const cameOn = (list: OrderRow[], day: string) => list.filter((o) => checkInsOf(o).some((c) => c.on_date === day))
  const datesSheet: ExportSheet = {
    name: 'Dates',
    columns: [
      { label: 'Name', width: 18 },
      { label: 'Starts', width: 17 },
      { label: 'Ends', width: 17 },
      { label: 'Registered orders', width: 14 },
      { label: 'Tickets', width: 9 },
      { label: 'Orders checked in that day', width: 16 },
      { label: 'People checked in that day', width: 16 },
    ],
    rows: dates.map((d) => {
      const list = onDate(d.id)
      const came = cameOn(list, localDay(d.starts_at))
      return [d.label ?? '', sheetMoment(d.starts_at), sheetMoment(d.ends_at), list.length, list.reduce((n, o) => n + o.quantity, 0), came.length, came.reduce((n, o) => n + o.quantity, 0)]
    }),
  }

  const soldOf = (typeId: string) => confirmed.reduce((n, o) => n + o.tickets.filter((t) => t.ticket_type_id === typeId).length, 0)
  const takingsOf = (typeId: string) => confirmed.reduce((n, o) => n + o.tickets.filter((t) => t.ticket_type_id === typeId).reduce((m, t) => m + t.unit_price_pence, 0), 0)
  const typesSheet: ExportSheet = {
    name: 'Ticket types',
    columns: [
      { label: 'Ticket type', width: 24 },
      { label: 'Description', width: 40 },
      { label: 'Kind', width: 10 },
      { label: 'Price (£)', width: 10 },
      { label: 'Smallest donation (£)', width: 14 },
      { label: 'Quantity', width: 10 },
      { label: 'Sold', width: 8 },
      { label: 'Left', width: 8 },
      { label: 'Takings before discounts (£)', width: 22 },
    ],
    rows: ticketTypes.map((t) => {
      const sold = soldOf(t.id)
      return [
        t.name,
        t.description ?? '',
        KIND_WORDS[t.kind],
        t.kind === 'paid' ? money(t.price_pence) : '',
        t.kind === 'donation' && t.min_donation_pence !== null ? money(t.min_donation_pence) : '',
        t.quantity ?? 'No limit',
        sold,
        t.quantity === null ? '' : Math.max(0, t.quantity - sold),
        money(takingsOf(t.id)),
      ]
    }),
  }

  // The accounts' three, then the money worked out for the books, then everything about the event.
  const sheets: ExportSheet[] = [fullOrders, fullTickets, summary, ...accountsSheets(full, orders, extras.now ?? new Date()), eventSheet, datesSheet, typesSheet]

  // Every check-in, a row a day: the Orders sheet has the latest only.
  const checkIns = orders.flatMap((o) => {
    const more = extras.more?.[o.id]
    return checkInsOf(o).map((c) => ({
      o,
      day: c.on_date,
      at: c.checked_in_at,
      by: who(more?.check_ins.find((x) => x.on_date === c.on_date)?.checked_in_by),
    }))
  })
  if (checkIns.length > 0) {
    sheets.push({
      name: 'Check-ins',
      columns: [
        { label: 'Day', width: 14 },
        { label: 'Checked in at', width: 17 },
        { label: 'Code', width: 14 },
        { label: 'Name', width: 24 },
        { label: 'Tickets', width: 8 },
        ...(extras.more ? [{ label: 'Checked in by', width: 20 }] : []),
      ],
      rows: checkIns
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((c) => [checkInDayName(c.day, dates), sheetMoment(c.at), c.o.code, c.o.name, c.o.quantity, ...(extras.more ? [c.by] : [])]),
    })
  }

  if (promoCodes.length > 0) {
    const used = (code: string) => confirmed.filter((o) => (o.promo_code ?? '').toUpperCase() === code.toUpperCase())
    sheets.push({
      name: 'Promo codes',
      columns: [
        { label: 'Code', width: 14 },
        { label: 'Takes off', width: 12 },
        { label: 'Ticket types', width: 30 },
        { label: 'Tickets it covers', width: 14 },
        { label: 'Most uses', width: 10 },
        { label: 'Uses counted', width: 12 },
        { label: 'On', width: 6 },
        { label: 'Registered orders', width: 14 },
        { label: 'Discount given (£)', width: 14 },
      ],
      rows: promoCodes.map((p) => [
        p.code,
        p.kind === 'percent' ? `${p.value}%` : `£${money(p.value).toFixed(2)}`,
        p.ticket_type_ids.length > 0 ? p.ticket_type_ids.map(typeName).join(', ') : 'Every type',
        p.tickets_covered ?? 'Every ticket',
        p.max_uses ?? 'No limit',
        p.uses,
        yesNo(p.active),
        used(p.code).length,
        money(used(p.code).reduce((n, o) => n + o.discount_pence, 0)),
      ]),
    })
  }

  if (extras.invites && extras.invites.length > 0) {
    const uses = inviteUses(orders)
    const now = extras.now ?? new Date()
    sheets.push({
      name: 'Invitations',
      columns: [
        { label: 'Name', width: 24 },
        { label: 'Kind', width: 10 },
        { label: 'Only for', width: 28 },
        { label: 'Gives', width: 26 },
        { label: 'Ticket types', width: 26 },
        { label: 'Most uses', width: 10 },
        { label: 'Registered orders', width: 14 },
        { label: 'Runs out', width: 17 },
        { label: 'Stands', width: 12 },
        { label: 'Made', width: 17 },
        { label: 'Link', width: 50 },
      ],
      rows: extras.invites.map((i) => [
        i.label,
        i.kind === 'personal' ? 'One person' : 'A group',
        i.locked_email ?? '',
        inviteGives(i),
        i.ticket_type_ids.length > 0 ? i.ticket_type_ids.map(typeName).join(', ') : 'Every type',
        i.max_uses ?? (i.kind === 'personal' ? 1 : 'No limit'),
        uses[i.id] ?? 0,
        sheetMoment(i.expires_at),
        INVITE_STATE_WORDS[inviteState(i, uses[i.id] ?? 0, now)],
        sheetMoment(i.created_at),
        i.anonymised_at ? '' : inviteUrl(event.slug, i.token, origin),
      ]),
    })
  }

  if (full.agenda && full.agenda.length > 0) {
    const agendaDay = (dateId: string | null) => {
      const d = dates.find((x) => x.id === dateId)
      return d ? (d.label?.trim() || whenWords(d.starts_at, null)) : dates.length > 1 ? 'Every day' : ''
    }
    sheets.push({
      name: 'Agenda',
      columns: [
        { label: 'Day', width: 22 },
        { label: 'Starts', width: 8 },
        { label: 'Ends', width: 8 },
        { label: 'What', width: 34 },
        { label: 'Details', width: 50 },
      ],
      rows: full.agenda.map((a) => [agendaDay(a.date_id), a.starts ?? '', a.ends ?? '', a.title, a.details ?? '']),
    })
  }

  if (extras.messages && extras.messages.length > 0) {
    const codeOf = (orderId: string | null) => orders.find((o) => o.id === orderId)?.code ?? ''
    sheets.push({
      name: 'Messages',
      columns: [
        { label: 'Received', width: 17 },
        { label: 'Name', width: 24 },
        { label: 'Email', width: 28 },
        { label: 'Order', width: 14 },
        { label: 'Message', width: 70 },
        { label: 'Dealt with', width: 17 },
        { label: 'Dealt with by', width: 20 },
      ],
      rows: extras.messages
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => [sheetMoment(m.created_at), m.name, m.email, codeOf(m.order_id), m.message, sheetMoment(m.handled_at), who(m.handled_by)]),
    })
  }

  return sheets
}
