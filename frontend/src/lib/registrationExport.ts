import { z } from 'zod'
import { supabase } from './supabaseClient'
import { checkInDayName, checkInsOf } from './checkInDays'
import { ticketUrl, registerUrl, inviteUrl } from './registrationLinks'
import { fetchInvites, inviteGives, inviteState, inviteUses, type Invite, type InviteState } from './registrationInvites'
import {
  ATTENDANCE_WORDS,
  STATUS_WORDS,
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

  const sheets: ExportSheet[] = [fullOrders, fullTickets, summary, eventSheet, datesSheet, typesSheet]

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
    const dayOf = (dateId: string | null) => {
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
      rows: full.agenda.map((a) => [dayOf(a.date_id), a.starts ?? '', a.ends ?? '', a.title, a.details ?? '']),
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
