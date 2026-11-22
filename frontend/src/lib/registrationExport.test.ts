import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import { accountsSheets, buildFullRegistrationWorkbook, chargedPerTicket, orderLedger, type RegistrationExportExtras } from './registrationExport'
import { buildRegistrationWorkbook, type OrderRow, type RegistrationEventFull } from './registrations'
import { sheetMoment, type ExportSheet } from './volunteerExport'
import type { Invite } from './registrationInvites'

/*
 * An event's export with everything in it (the Owner, November 2026: "as
 * detailed as possible [...] Every single details about that person or
 * event etc"). The accounts' three sheets stay first and as they were;
 * the rest is added on the end of them and after them.
 */

const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()
const NOW = new Date(2026, 10, 22, 9, 0)

const row = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: '07700 900123',
  quantity: 3,
  subtotal_pence: 5000,
  discount_pence: 500,
  total_pence: 4500,
  promo_code: 'EARLY',
  payment_status: 'awaiting',
  payment_method: null,
  status: 'confirmed',
  checked_in_at: null,
  notes: null,
  anonymised_at: null,
  created_at: at(2026, 11, 2, 10, 0),
  tickets: [
    { ticket_type_id: 't1', attendee_name: 'Ama Owusu', unit_price_pence: 2000 },
    { ticket_type_id: 't1', attendee_name: 'Kofi Owusu', unit_price_pence: 2000 },
    { ticket_type_id: 't2', attendee_name: null, unit_price_pence: 1000 },
  ],
  ...over,
})

const full = (over: Partial<RegistrationEventFull> = {}): RegistrationEventFull => ({
  event: {
    id: 'e1',
    slug: 'conference-2026',
    title: 'Pastors’ Conference',
    description: 'Two days for pastors and leaders.',
    image_path: null,
    attendance: 'both',
    join_url: 'https://meet.example/abc',
    join_details: 'Passcode 1234',
    status: 'published',
    date_mode: 'all',
    location_name: 'The Hall',
    address: '1 High Street, Leeds',
    latitude: 53.8,
    longitude: -1.55,
    registration_opens_at: at(2026, 10, 1, 9, 0),
    registration_closes_at: at(2026, 11, 20, 12, 0),
    min_per_order: 1,
    max_per_order: 10,
    payment_links: [{ label: 'PayPal', url: 'https://paypal.example/rim' }],
    payment_accounts: [{ label: 'Main', account_name: 'RIM', bank_name: 'Barclays', sort_code: '20-00-00', account_number: '12345678' }],
    payment_use_church_giving: false,
    payment_note: 'Use your booking code as the reference.',
    allow_pay_at_reception: true,
    add_to_diary: true,
    created_at: at(2026, 9, 1, 10, 0),
    updated_at: at(2026, 11, 1, 10, 0),
  },
  dates: [
    { id: 'd1', event_id: 'e1', starts_at: at(2026, 11, 20, 18, 30), ends_at: at(2026, 11, 20, 21, 0), label: 'Day 1', sort_order: 0, diary_event_id: null },
    { id: 'd2', event_id: 'e1', starts_at: at(2026, 11, 21, 10, 0), ends_at: null, label: 'Day 2', sort_order: 1, diary_event_id: null },
  ],
  ticketTypes: [
    { id: 't1', event_id: 'e1', name: 'Adult', description: 'With lunch', kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: 40, sort_order: 0 },
    { id: 't2', event_id: 'e1', name: 'Child', description: null, kind: 'donation', price_pence: 0, min_donation_pence: 500, quantity: null, sort_order: 1 },
  ],
  promoCodes: [
    { id: 'p1', event_id: 'e1', code: 'EARLY', kind: 'percent', value: 10, ticket_type_ids: ['t1'], max_uses: 50, uses: 1, active: true, tickets_covered: null },
  ],
  agenda: [
    { id: 'a1', event_id: 'e1', date_id: 'd1', sort_order: 0, title: 'Worship', details: 'Main hall', starts: '18:30', ends: '19:15' },
    { id: 'a2', event_id: 'e1', date_id: null, sort_order: 1, title: 'Registration desk', details: null, starts: null, ends: null },
  ],
  ...over,
})

const fri = { on_date: '2026-11-20', checked_in_at: at(2026, 11, 20, 18, 15) }
const sat = { on_date: '2026-11-21', checked_in_at: at(2026, 11, 21, 10, 2) }
const orders = [
  row({ checked_in_at: sat.checked_in_at, check_ins: [sat, fri], email_sent_at: at(2026, 11, 2, 10, 1), proof_path: 'proofs/x.jpg', proof_at: at(2026, 11, 3, 8, 0) }),
  row({ id: 'o2', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', email: 'ama@example.org', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, payment_status: 'received', tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
  row({ id: 'o3', code: 'CDEFGHJKMNPQ', name: 'Asha Mathew', email: 'asha@example.org', status: 'cancelled', invite_id: 'i1', email_changed_at: at(2026, 11, 4, 9, 0), changer: null, email_before: { email: 'ahsa@example.org' }, email_status_detail: 'mailbox full' }),
]

const sheetNamed = (sheets: ExportSheet[], name: string) => sheets.find((s) => s.name === name)!
const cell = (of: ExportSheet, rowIndex: number, label: string) => {
  const i = of.columns.findIndex((c) => c.label === label)
  if (i < 0) throw new Error(`no column called ${label}`)
  return of.rows[rowIndex][i]
}
const build = (extras: RegistrationExportExtras = {}, f = full(), list = orders) =>
  buildFullRegistrationWorkbook(f, list, { i1: 'Speakers' }, { origin: 'https://app.example', now: NOW, ...extras })

describe('the accounts’ three sheets, kept', () => {
  it('are first, in their order, and begin with the columns they always had', () => {
    const before = buildRegistrationWorkbook(full(), orders, { i1: 'Speakers' })
    const after = build()
    expect(after.slice(0, 3).map((s) => s.name)).toEqual(['Orders', 'Tickets', 'Summary'])
    for (const i of [0, 1]) {
      const had = before[i].columns.map((c) => c.label)
      expect(after[i].columns.map((c) => c.label).slice(0, had.length)).toEqual(had)
      // And the same values under them, row for row.
      expect(after[i].rows.map((r) => r.slice(0, had.length))).toEqual(before[i].rows)
    }
    expect(after[2]).toEqual(before[2])
  })

  it('keeps every row as wide as its headings', () => {
    for (const s of build({ more: {} })) for (const r of s.rows) expect(r, s.name).toHaveLength(s.columns.length)
  })
})

describe('more about each order', () => {
  const o = sheetNamed(build(), 'Orders')

  it('says what was bought and who is coming', () => {
    expect(cell(o, 0, 'Ticket types')).toBe('2 × Adult, 1 × Child')
    expect(cell(o, 0, 'Attendees')).toBe('Ama Owusu, Kofi Owusu')
    expect(cell(o, 1, 'Attendees')).toBe('')
  })

  it('says what is still owed: nothing once paid, nothing on a cancelled order', () => {
    expect(cell(o, 0, 'Still to pay (£)')).toBe(45)
    expect(cell(o, 1, 'Still to pay (£)')).toBe(0)
    expect(cell(o, 2, 'Still to pay (£)')).toBe(0)
  })

  it('carries everything that happened to the email', () => {
    expect(cell(o, 0, 'Email sent')).toBe(sheetMoment(at(2026, 11, 2, 10, 1)))
    expect(cell(o, 2, 'Email problem')).toBe('mailbox full')
    expect(cell(o, 2, 'Email changed at')).toBe(sheetMoment(at(2026, 11, 4, 9, 0)))
    // Changed with nobody named: the attendee did it from their ticket.
    expect(cell(o, 2, 'Email changed by')).toBe('The attendee')
    expect(cell(o, 2, 'Email before')).toBe('ahsa@example.org')
    expect(cell(o, 0, 'Email changed by')).toBe('')
  })

  it('says a receipt was sent, and that there is a file', () => {
    expect(cell(o, 0, 'Receipt sent at')).toBe(sheetMoment(at(2026, 11, 3, 8, 0)))
    expect(cell(o, 0, 'Receipt file')).toBe('Yes')
    expect(cell(o, 1, 'Receipt file')).toBe('')
  })

  it('marks two live orders under one address, and not a cancelled one', () => {
    expect([0, 1, 2].map((i) => cell(o, i, 'Shares an email'))).toEqual(['Yes', 'Yes', ''])
  })

  it('gives each order the link to its ticket', () => {
    expect(cell(o, 0, 'Ticket link')).toBe('https://app.example/ticket/ABCDEFGHJKMN')
  })

  it('says when an order was cancelled and who checked it in, when that was read', () => {
    const more = {
      o1: { cancelled_at: null, checked_in_by: 'u9', check_ins: [{ ...fri, checked_in_by: 'u8' }, { ...sat, checked_in_by: 'u9' }] },
      o3: { cancelled_at: at(2026, 11, 5, 12, 0), checked_in_by: null, check_ins: [] },
    }
    const names = { u8: 'Grace Mensah', u9: 'Rohit F' }
    const withMore = sheetNamed(build({ more, names }), 'Orders')
    expect(cell(withMore, 0, 'Checked in by')).toBe('Rohit F')
    expect(cell(withMore, 2, 'Cancelled at')).toBe(sheetMoment(at(2026, 11, 5, 12, 0)))
    // Not read: the columns are not there, rather than there and blank.
    expect(o.columns.map((c) => c.label)).not.toContain('Cancelled at')
    expect(o.columns.map((c) => c.label)).not.toContain('Checked in by')
  })
})

describe('more about each ticket', () => {
  it('carries who booked it, whether it is paid and whether they came', () => {
    const t = sheetNamed(build(), 'Tickets')
    expect(cell(t, 0, 'Email')).toBe('ama@example.org')
    expect(cell(t, 0, 'Paid')).toBe('No')
    expect(cell(t, 3, 'Paid')).toBe('Yes')
    expect(cell(t, 0, 'Checked in')).toBe(sheetMoment(sat.checked_in_at))
  })
})

describe('the event itself', () => {
  const value = (label: string, extras: RegistrationExportExtras = {}, f = full()) => {
    const e = sheetNamed(build(extras, f), 'Event')
    return e.rows.find((r) => r[0] === label)?.[1]
  }

  it('has a sheet of its own with everything it was set up with', () => {
    expect(value('Event')).toBe('Pastors’ Conference')
    expect(value('Status')).toBe('Taking registrations')
    expect(value('Public page')).toBe('https://app.example/register/conference-2026')
    expect(value('Attendance')).toBe('In person and online')
    expect(value('Venue')).toBe('The Hall')
    expect(value('Address')).toBe('1 High Street, Leeds')
    expect(value('Map position')).toBe('53.8, -1.55')
    expect(value('Online link')).toBe('https://meet.example/abc')
    expect(value('Online details')).toBe('Passcode 1234')
    expect(value('A booking is for')).toBe('Every date')
    expect(value('Tickets in one order')).toBe('1 to 10')
    expect(value('Can pay at reception')).toBe('Yes')
    expect(value('Uses the church’s giving details')).toBe('No')
    expect(value('Payment links')).toBe('PayPal: https://paypal.example/rim')
    expect(value('Bank accounts')).toBe('Main, RIM, Barclays, sort code 20-00-00, account 12345678')
    expect(value('Payment note')).toBe('Use your booking code as the reference.')
    expect(value('In the church diary')).toBe('Yes')
    expect(value('Description')).toBe('Two days for pastors and leaders.')
    expect(value('Registration closes')).toBe(sheetMoment(at(2026, 11, 20, 12, 0)))
    expect(String(value('Dates'))).toMatch(/^Day 1: .*; Day 2: /)
    expect(value('Orders')).toBe(3)
    expect(value('Registered orders')).toBe(2)
    expect(value('Tickets')).toBe(4)
    expect(value('Exported')).toBe(sheetMoment(NOW.toISOString()))
  })

  it('says it was cancelled, when and why', () => {
    const f = full()
    f.event = { ...f.event, cancelled_at: at(2026, 11, 10, 9, 0), cancel_note: 'The speaker is unwell.' }
    expect(value('Status', {}, f)).toBe('Cancelled')
    expect(value('Cancelled at', {}, f)).toBe(sheetMoment(at(2026, 11, 10, 9, 0)))
    expect(value('Why it was cancelled', {}, f)).toBe('The speaker is unwell.')
    expect(value('Cancelled at')).toBeUndefined()
  })

  it('says what could not be read, rather than going quietly short', () => {
    expect(value('Left out of this export (could not be read)', { leftOut: ['the invitation links', 'the messages to the organisers'] })).toBe(
      'the invitation links; the messages to the organisers',
    )
    expect(value('Left out of this export (could not be read)')).toBeUndefined()
  })
})

describe('its dates, ticket types and check-ins', () => {
  it('counts each date: every booking on each when a booking is for all of them', () => {
    const d = sheetNamed(build(), 'Dates')
    expect(d.rows.map((r) => [r[0], r[3], r[4], r[5], r[6]])).toEqual([
      ['Day 1', 2, 4, 1, 3],
      ['Day 2', 2, 4, 1, 3],
    ])
    expect(d.rows[0][1]).toBe(sheetMoment(at(2026, 11, 20, 18, 30)))
    expect(d.rows[1][2]).toBe('')
  })

  it('counts a booking on its own date when one is chosen', () => {
    const f = full()
    f.event = { ...f.event, date_mode: 'choose' }
    const list = [row({ date_id: 'd1' }), row({ id: 'o2', code: 'B', date_id: 'd2', quantity: 1 }), row({ id: 'o3', code: 'C', date_id: 'd2', quantity: 2 })]
    expect(sheetNamed(build({}, f, list), 'Dates').rows.map((r) => [r[0], r[3], r[4]])).toEqual([
      ['Day 1', 1, 3],
      ['Day 2', 2, 3],
    ])
  })

  it('lists each ticket type with what it is, how many sold and how many are left', () => {
    const t = sheetNamed(build(), 'Ticket types')
    expect(t.rows).toEqual([
      ['Adult', 'With lunch', 'Paid', 20, '', 40, 3, 37, 60],
      ['Child', '', 'Donation', '', 5, 'No limit', 1, '', 10],
    ])
  })

  it('lists every check-in, a row a day, in the order they happened', () => {
    const more = { o1: { cancelled_at: null, checked_in_by: 'u9', check_ins: [{ ...fri, checked_in_by: 'u8' }, { ...sat, checked_in_by: 'u9' }] } }
    const c = sheetNamed(build({ more, names: { u8: 'Grace Mensah', u9: 'Rohit F' } }), 'Check-ins')
    expect(c.rows).toEqual([
      ['Day 1', sheetMoment(fri.checked_in_at), 'ABCDEFGHJKMN', 'Ama Owusu', 3, 'Grace Mensah'],
      ['Day 2', sheetMoment(sat.checked_in_at), 'ABCDEFGHJKMN', 'Ama Owusu', 3, 'Rohit F'],
    ])
  })

  it('has no Check-ins sheet for an event nobody was checked in to', () => {
    expect(build({}, full(), [row()]).map((s) => s.name)).not.toContain('Check-ins')
  })
})

describe('its promo codes, invitations, agenda and messages', () => {
  it('lists each promo code with what it gives and what it has given', () => {
    const p = sheetNamed(build(), 'Promo codes')
    expect(p.rows).toEqual([['EARLY', '10%', 'Adult', 'Every ticket', 50, 1, 'Yes', 1, 5]])
  })

  it('lists each invitation link with how it stands and how many came by it', () => {
    const invite: Invite = {
      id: 'i1', event_id: 'e1', token: 'ABCDEFGHJKLM', label: 'Speakers', kind: 'group', locked_email: null, discount_kind: 'percent', discount_value: 100,
      ticket_type_ids: [], tickets_covered: 1, max_uses: 20, expires_at: null, active: true, anonymised_at: null, created_at: at(2026, 10, 1, 9, 0),
    }
    // The cancelled order came by it, and is not counted as a use.
    const i = sheetNamed(build({ invites: [invite] }), 'Invitations')
    expect(i.rows).toEqual([
      ['Speakers', 'A group', '', '1 free ticket', 'Every type', 20, 0, '', 'Live', sheetMoment(at(2026, 10, 1, 9, 0)), 'https://app.example/register/conference-2026?invite=ABCDEFGHJKLM'],
    ])
  })

  it('lists the agenda, each line under its day', () => {
    expect(sheetNamed(build(), 'Agenda').rows).toEqual([
      ['Day 1', '18:30', '19:15', 'Worship', 'Main hall'],
      ['Every day', '', '', 'Registration desk', ''],
    ])
  })

  it('lists the messages sent to the organisers, oldest first, with who dealt with each', () => {
    const messages = [
      { id: 'm2', event_id: 'e1', order_id: null, name: 'Tunde', email: 'tunde@example.org', message: 'Is there parking?', created_at: at(2026, 11, 6, 9, 0), handled_at: null, handled_by: null },
      { id: 'm1', event_id: 'e1', order_id: 'o1', name: 'Ama Owusu', email: 'ama@example.org', message: 'Can I bring a guest?', created_at: at(2026, 11, 5, 9, 0), handled_at: at(2026, 11, 5, 10, 0), handled_by: 'u9' },
    ]
    const m = sheetNamed(build({ messages, names: { u9: 'Rohit F' } }), 'Messages')
    expect(m.rows).toEqual([
      [sheetMoment(at(2026, 11, 5, 9, 0)), 'Ama Owusu', 'ama@example.org', 'ABCDEFGHJKMN', 'Can I bring a guest?', sheetMoment(at(2026, 11, 5, 10, 0)), 'Rohit F'],
      [sheetMoment(at(2026, 11, 6, 9, 0)), 'Tunde', 'tunde@example.org', '', 'Is there parking?', '', ''],
    ])
  })

  it('leaves out a sheet there is nothing for', () => {
    const bare = full({ promoCodes: [], agenda: [] })
    const names = build({}, bare, [row()]).map((s) => s.name)
    // The money sheets are always there; Taken by, Outstanding and Refunds only with something in them.
    expect(names).toEqual(['Orders', 'Tickets', 'Summary', 'Money', 'Accounts', 'Money by day', 'Income by ticket type', 'Outstanding', 'Event', 'Dates', 'Ticket types'])
  })
})

/*
 * For whoever keeps the church's books (the Owner: "Does the export in
 * registration have useful information for accountants of church ?? If
 * not, add such info too"). The money worked out: the cash position, a
 * ledger, what came in each day, who took it, income by ticket type, who
 * still owes, and the refunds.
 */
describe('the money, for the books', () => {
  const types: RegistrationEventFull['ticketTypes'] = [
    { id: 't1', event_id: 'e1', name: 'Adult', description: null, kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: null, sort_order: 0 },
    { id: 't2', event_id: 'e1', name: 'Child', description: null, kind: 'paid', price_pence: 1000, min_donation_pence: null, quantity: null, sort_order: 1 },
  ]
  const event = full({ ticketTypes: types })
  const order = (id: string, over: Partial<OrderRow>): OrderRow =>
    row({ id, code: id.toUpperCase(), name: id, quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }], created_at: at(2026, 11, 1, 10, 0), ...over })
  const rohit = { first_name: 'Rohit', last_name: 'F' }
  const grace = { first_name: 'Grace', last_name: 'Mensah' }
  const books = [
    // Paid by bank, verified.
    order('bank', { payment_status: 'received', payment_method: 'bank', received_at: at(2026, 11, 3, 9, 0), receiver: rohit, payment_verified_at: at(2026, 11, 4, 9, 0), verifier: grace, proof_reference: 'REF-1' }),
    // Paid in cash at the door, not verified; two tickets with £5 off.
    order('door', {
      payment_status: 'received', payment_method: 'reception', received_at: at(2026, 11, 20, 18, 40), receiver: grace, quantity: 2, subtotal_pence: 3000, discount_pence: 500, total_pence: 2500, promo_code: 'EARLY',
      tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }, { ticket_type_id: 't2', attendee_name: null, unit_price_pence: 1000 }],
    }),
    // Not paid yet.
    order('owes', { payment_status: 'awaiting', created_at: at(2026, 11, 10, 10, 0) }),
    // Says they paid; nobody has confirmed it.
    order('says', { payment_status: 'reported', payment_method: 'bank', proof_reference: 'REF-2', proof_at: at(2026, 11, 12, 8, 0), created_at: at(2026, 11, 11, 10, 0) }),
    // Let go.
    order('waived', { payment_status: 'waived' }),
    // Free.
    order('free', { payment_status: 'not_needed', subtotal_pence: 0, total_pence: 0, tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 0 }] }),
    // Paid, then cancelled: the refund is still owed.
    order('owed', { status: 'cancelled', payment_status: 'received', payment_method: 'paypal', received_at: at(2026, 11, 3, 15, 0), refund_status: 'owed' }),
    // Paid, cancelled, and refunded.
    order('back', { status: 'cancelled', payment_status: 'received', payment_method: 'bank', received_at: at(2026, 11, 5, 9, 0), receiver: rohit, refund_status: 'refunded', refund_at: at(2026, 11, 8, 9, 0), refunder: rohit }),
    // Reported, never confirmed, cancelled: a refund is owed on money nobody has seen.
    order('unsure', { status: 'cancelled', payment_status: 'reported', payment_method: 'bank', refund_status: 'owed' }),
  ]
  const now = new Date(2026, 10, 22, 9, 0)
  const sheets = accountsSheets(event, books, now)
  const named = (name: string) => sheets.find((s) => s.name === name)!
  const figure = (label: string) => named('Money').rows.find((r) => String(r[0]).trim() === label)?.[1]

  it('comes straight after the accounts’ three sheets, before anything about the event', () => {
    const all = buildFullRegistrationWorkbook(event, books, {}, { now }).map((s) => s.name)
    expect(all.slice(0, 11)).toEqual(['Orders', 'Tickets', 'Summary', 'Money', 'Accounts', 'Money by day', 'Taken by', 'Income by ticket type', 'Outstanding', 'Refunds', 'Event'])
  })

  it('keeps every row as wide as its headings', () => {
    for (const s of sheets) for (const r of s.rows) expect(r, s.name).toHaveLength(s.columns.length)
  })

  describe('one order’s money', () => {
    it('is received whether the order is live or was cancelled since', () => {
      expect(orderLedger(books[0])).toMatchObject({ charged: 2000, received: 2000, held: 2000, income: 2000, outstanding: 0 })
      expect(orderLedger(books[6])).toMatchObject({ charged: 0, received: 2000, refundOwed: 2000, held: 2000, income: 0 })
    })
    it('is nothing held once it has been given back', () => {
      expect(orderLedger(books[7])).toMatchObject({ received: 2000, refunded: 2000, held: 0, income: 0, note: '' })
    })
    it('is owed while unpaid or only reported, and never both owed and received', () => {
      expect(orderLedger(books[2])).toMatchObject({ outstanding: 2000, received: 0 })
      expect(orderLedger(books[3])).toMatchObject({ outstanding: 2000, received: 0 })
    })
    it('is neither owed nor received when waived or free', () => {
      expect(orderLedger(books[4])).toMatchObject({ waived: 2000, outstanding: 0, received: 0, held: 0 })
      expect(orderLedger(books[5])).toMatchObject({ charged: 0, waived: 0, outstanding: 0, received: 0 })
    })
    it('says so where a refund is owed on money nobody confirmed', () => {
      expect(orderLedger(books[8])).toMatchObject({ received: 0, refundOwed: 2000, held: 0, note: 'A refund is owed on a payment that was reported but never confirmed' })
      expect(orderLedger({ status: 'cancelled', total_pence: 2000, payment_status: 'reported', refund_status: 'refunded' }).note).toBe('Refunded, but the payment was never marked received')
    })
  })

  describe('the cash position', () => {
    it('tells live money apart: received, still to come and waived add up to what was charged', () => {
      expect(figure('Value before discounts')).toBe(110)
      expect(figure('Discounts given')).toBe(5)
      expect(figure('Charged')).toBe(105)
      expect(figure('Received')).toBe(45)
      expect(figure('Still to come')).toBe(40)
      expect(figure('Waived')).toBe(20)
      expect(Number(figure('Received')) + Number(figure('Still to come')) + Number(figure('Waived'))).toBe(figure('Charged'))
      expect(figure('of Still to come: receipt sent, being checked')).toBe(20)
    })

    it('counts what came in on registrations since cancelled, what went back and what is still owed back', () => {
      expect(figure('Received on registrations since cancelled')).toBe(40)
      expect(figure('Refunded')).toBe(20)
      expect(figure('Refunds still owed')).toBe(40)
      expect(figure('of which on money marked received')).toBe(20)
      expect(figure('of which on a payment only reported')).toBe(20)
    })

    it('says what should be in the bank and the cash box, and what stays once refunds are paid', () => {
      expect(figure('Total received, every registration')).toBe(85)
      expect(figure('Less refunded')).toBe(20)
      expect(figure('Money held now')).toBe(65)
      expect(figure('Less refunds still owed on money received')).toBe(20)
      expect(figure('Income to keep')).toBe(45)
      // Income to keep is exactly what was received on live registrations.
      expect(figure('Income to keep')).toBe(figure('Received'))
    })

    it('splits what was received by whether it was checked against the bank, and by way of paying', () => {
      expect(figure('Received and verified')).toBe(20)
      expect(figure('Received, not yet verified')).toBe(65)
      expect(figure('Bank transfer')).toBe(40)
      expect(figure('Online link')).toBe(20)
      expect(figure('At reception')).toBe(25)
      expect(figure('No way recorded')).toBe(0)
      expect(Number(figure('Bank transfer')) + Number(figure('Online link')) + Number(figure('At reception'))).toBe(figure('Total received, every registration'))
    })
  })

  describe('the ledger', () => {
    const ledger = named('Accounts')
    const col = (label: string) => ledger.columns.findIndex((c) => c.label === label)
    const of = (code: string) => ledger.rows.find((r) => r[0] === code)!

    it('has a row for every order, in the order the money came in, the unpaid after', () => {
      expect(ledger.rows).toHaveLength(books.length)
      expect(ledger.rows.slice(0, 4).map((r) => r[0])).toEqual(['BANK', 'OWED', 'BACK', 'DOOR'])
    })

    it('carries each order’s money as numbers and its dates so that they sort', () => {
      const bank = of('BANK')
      expect(bank[col('Paid on')]).toBe('2026-11-03')
      expect(bank[col('Received (£)')]).toBe(20)
      expect(bank[col('Taken by')]).toBe('Rohit F')
      expect(bank[col('Reference')]).toBe('REF-1')
      expect(bank[col('Verified')]).toBe('Yes')
      expect(bank[col('Verified on')]).toBe('2026-11-04')
      expect(bank[col('Verified by')]).toBe('Grace Mensah')
      expect(of('DOOR')[col('Verified')]).toBe('No')
      // Unpaid: nothing to verify, so nothing said.
      expect(of('OWES')[col('Verified')]).toBe('')
      expect(of('OWES')[col('Still to come (£)')]).toBe(20)
    })

    it('adds up to the cash position, column by column', () => {
      const sum = (label: string) => ledger.rows.reduce((n, r) => n + Number(r[col(label)]), 0)
      expect(sum('Received (£)')).toBe(figure('Total received, every registration'))
      expect(sum('Refunded (£)')).toBe(figure('Refunded'))
      expect(sum('Refund owed (£)')).toBe(figure('Refunds still owed'))
      expect(sum('Money held (£)')).toBe(figure('Money held now'))
      expect(sum('Income to keep (£)')).toBe(figure('Income to keep'))
      expect(sum('Still to come (£)')).toBe(figure('Still to come'))
      expect(sum('Waived (£)')).toBe(figure('Waived'))
    })

    it('points at what the books should look at twice', () => {
      expect(of('UNSURE')[col('To look at')]).toBe('A refund is owed on a payment that was reported but never confirmed')
      expect(of('BANK')[col('To look at')]).toBe('')
    })
  })

  it('says what came in and went back each day, by way of paying, to lay beside a bank statement', () => {
    const d = named('Money by day')
    expect(d.columns.map((c) => c.label)).toEqual(['Day', 'Bank transfer (£)', 'Online link (£)', 'At reception (£)', 'No way recorded (£)', 'Received (£)', 'Payments', 'Refunded (£)', 'Refunds', 'Net (£)'])
    expect(d.rows).toEqual([
      ['2026-11-03', 20, 20, 0, 0, 40, 2, 0, 0, 40],
      ['2026-11-05', 20, 0, 0, 0, 20, 1, 0, 0, 20],
      ['2026-11-08', 0, 0, 0, 0, 0, 0, 20, 1, -20],
      ['2026-11-20', 0, 0, 25, 0, 25, 1, 0, 0, 25],
    ])
    // The days add up to the money held.
    expect(d.rows.reduce((n, r) => n + Number(r[9]), 0)).toBe(figure('Money held now'))
  })

  it('names who took the money, by which way', () => {
    expect(named('Taken by').rows).toEqual([
      ['Grace Mensah', 'At reception', 1, 25],
      ['Nobody named', 'Online link', 1, 20],
      ['Rohit F', 'Bank transfer', 2, 40],
    ])
  })

  it('gives income by ticket type, an order’s discount shared across its tickets by price', () => {
    const t = named('Income by ticket type')
    // Adult: bank, door (£20 of £30, so £16.67 of the £25), owes, says, waived, free. Child: door (£8.33).
    expect(t.rows).toEqual([
      ['Adult', 6, 100, 3.33, 96.67, 36.67, 40, 20],
      ['Child', 1, 10, 1.67, 8.33, 8.33, 0, 0],
    ])
    const sum = (i: number) => Math.round(t.rows.reduce((n, r) => n + Number(r[i]) * 100, 0)) / 100
    expect(sum(4)).toBe(figure('Charged'))
    expect(sum(5)).toBe(figure('Received'))
    expect(sum(6)).toBe(figure('Still to come'))
    expect(sum(7)).toBe(figure('Waived'))
    expect(sum(3)).toBe(figure('Discounts given'))
  })

  it('shares an order’s total across its tickets to the penny', () => {
    expect(chargedPerTicket({ total_pence: 2500, tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }, { ticket_type_id: 't2', attendee_name: null, unit_price_pence: 1000 }] })).toEqual([1667, 833])
    // Three alike and a total that does not divide: the odd penny goes somewhere, and nothing is lost.
    const three = chargedPerTicket({ total_pence: 1000, tickets: [1, 2, 3].map(() => ({ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 500 })) })
    expect(three.reduce((a, b) => a + b, 0)).toBe(1000)
    expect(three).toEqual([334, 333, 333])
    expect(chargedPerTicket({ total_pence: 0, tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 0 }] })).toEqual([0])
    expect(chargedPerTicket({ total_pence: 0, tickets: [] })).toEqual([])
  })

  it('lists who still owes, the longest owed first, with how to reach them', () => {
    const o = named('Outstanding')
    expect(o.rows.map((r) => [r[0], r[4], r[5], r[6], r[7], r[8], r[9], r[10]])).toEqual([
      ['OWES', '2026-11-10', 12, 20, 'Awaiting payment', 'Not chosen', '', ''],
      ['SAYS', '2026-11-11', 11, 20, 'Receipt sent — being checked', 'Bank transfer', 'REF-2', '2026-11-12'],
    ])
    expect(o.rows[0][2]).toBe('ama@example.org')
  })

  it('lists the refunds, what is still to do first', () => {
    const r = named('Refunds')
    expect(r.rows.map((x) => [x[0], x[3], x[4], x[5], x[6], x[9], x[10], x[11]])).toEqual([
      ['OWED', 20, 'Owed', 'Online link', '2026-11-03', '', '', ''],
      ['UNSURE', 20, 'Owed', 'Bank transfer', '', '', '', 'A refund is owed on a payment that was reported but never confirmed'],
      ['BACK', 20, 'Refunded', 'Bank transfer', '2026-11-05', '2026-11-08', 'Rohit F', ''],
    ])
  })

  it('leaves out Taken by, Outstanding and Refunds for an event with nothing in them', () => {
    const quiet = accountsSheets(event, [order('free', { payment_status: 'not_needed', subtotal_pence: 0, total_pence: 0 })], now).map((s) => s.name)
    expect(quiet).toEqual(['Money', 'Accounts', 'Money by day', 'Income by ticket type'])
  })
})

