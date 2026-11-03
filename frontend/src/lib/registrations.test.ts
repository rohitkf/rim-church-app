import { describe, expect, it } from 'vitest'
import { lifespanOf } from './lifespan'
import {
  buildRegistrationWorkbook,
  datesOf,
  draftFromEvent,
  draftProblems,
  emptyDraft,
  localIso,
  localParts,
  newDateDraft,
  newPromoDraft,
  newTicketTypeDraft,
  orderMatches,
  orderTotals,
  registrationExportFileName,
  remainingOf,
  slugTyping,
  slugify,
  whenWords,
  type EventDraft,
  type OrderRow,
  type PublicTicketType,
  type RegistrationEventFull,
} from './registrations'

/*
 * Registrations (0244): the creator's draft, checked and turned into rows;
 * the public page's own sums, which have to agree with the database's.
 */

/** A moment in the browser's own clock, so the tests hold in any timezone. */
const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).toISOString()

const good = (): EventDraft => ({
  ...emptyDraft(),
  title: 'Pastors & Leaders Conference 2026',
  slug: 'pastors-leaders-conference-2026',
  sameTimes: true,
  start: '18:30',
  end: '21:00',
  dates: [{ ...newDateDraft(), date: '2026-11-21' }],
})

describe('the link made from a title', () => {
  it('is lower-case words joined by dashes, and nothing else', () => {
    expect(slugify('Pastors & Leaders Conference 2026')).toBe('pastors-leaders-conference-2026')
    expect(slugify('  Youth   Night!! ')).toBe('youth-night')
    expect(slugify('Café – Noël')).toBe('cafe-noel')
  })

  it('keeps a dash at the end while the link is still being typed', () => {
    expect(slugTyping('plc ')).toBe('plc-')
    expect(slugTyping('--Plc--26')).toBe('plc-26')
    expect(slugify('plc-')).toBe('plc')
  })

  it('stops at 80 characters without a dangling dash', () => {
    const long = slugify('a'.repeat(79) + ' b c')
    expect(long.length).toBeLessThanOrEqual(80)
    expect(long.endsWith('-')).toBe(false)
  })
})

describe('the two boxes and the moment they mean', () => {
  it('go there and back', () => {
    const iso = localIso('2026-11-21', '18:30')
    expect(iso).not.toBeNull()
    expect(localParts(iso)).toEqual({ date: '2026-11-21', time: '18:30' })
  })

  it('are nothing when either box is empty or wrong', () => {
    expect(localIso('', '18:30')).toBeNull()
    expect(localIso('2026-11-21', '')).toBeNull()
    expect(localIso('someday', '18:30')).toBeNull()
    expect(localParts(null)).toEqual({ date: '', time: '' })
    expect(localParts('not a date')).toEqual({ date: '', time: '' })
  })
})

describe('the dates a draft means', () => {
  it('gives every date the shared start and end', () => {
    const draft = { ...good(), dates: [{ ...newDateDraft(), date: '2026-11-21' }, { ...newDateDraft(), date: '2026-11-22', label: ' Day 2 ' }] }
    const dates = datesOf(draft)
    expect(dates).toEqual([
      { starts: at(2026, 11, 21, 18, 30), ends: at(2026, 11, 21, 21, 0), label: null },
      { starts: at(2026, 11, 22, 18, 30), ends: at(2026, 11, 22, 21, 0), label: 'Day 2' },
    ])
  })

  it('lets each date keep its own times, and end on another day', () => {
    const draft: EventDraft = {
      ...good(),
      sameTimes: false,
      dates: [{ ...newDateDraft(), date: '2026-12-31', start: '22:00', endDate: '2027-01-01', end: '00:30' }],
    }
    expect(datesOf(draft)).toEqual([{ starts: at(2026, 12, 31, 22, 0), ends: at(2027, 1, 1, 0, 30), label: null }])
  })

  it('says which date is wrong', () => {
    expect(datesOf({ ...good(), dates: [{ ...newDateDraft(), date: '' }] })).toBe('Date 1 needs a day and a start time.')
    expect(datesOf({ ...good(), start: '21:00', end: '18:30' })).toBe('Date 1 ends before it starts.')
    expect(datesOf({ ...good(), sameTimes: false, dates: [{ ...newDateDraft(), date: '2026-11-21', start: '18:30', end: 'late' }] })).toBe(
      'Date 1 has an end time that is not a time.',
    )
  })
})

describe('what stops a draft being saved', () => {
  it('is nothing for a complete one', () => {
    expect(draftProblems(good())).toEqual([])
  })

  it('starts each date with its own times, and a ticket type that already has an id', () => {
    const draft = emptyDraft()
    expect(draft.sameTimes).toBe(false)
    expect(draft.ticketTypes[0]).toMatchObject({ isNew: true, name: 'General admission' })
    expect(draft.ticketTypes[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('names the title, the link and the first date on a blank one', () => {
    const problems = draftProblems(emptyDraft())
    expect(problems).toContain('Give the event a title.')
    expect(problems).toContain('The link needs at least three letters or digits, joined by dashes.')
    expect(problems).toContain('Date 1 needs a day and a start time.')
  })

  it('checks each ticket type', () => {
    const draft = {
      ...good(),
      ticketTypes: [
        { ...newTicketTypeDraft(), name: '', kind: 'paid' as const, price: '' },
        { ...newTicketTypeDraft(), name: 'Give', kind: 'donation' as const, minDonation: 'five' },
        { ...newTicketTypeDraft(), name: 'Standard', quantity: 'lots' },
      ],
    }
    expect(draftProblems(draft)).toEqual([
      'Ticket 1 needs a name.',
      'Ticket 1 needs a price.',
      'Ticket 2: the least to give is not a price.',
      'Ticket 3: the quantity is not a number.',
    ])
  })

  it('checks each promo code', () => {
    const draft = {
      ...good(),
      promoCodes: [
        { ...newPromoDraft(), code: 'EARLY', value: '10' },
        { ...newPromoDraft(), code: 'early', value: '120' },
        { ...newPromoDraft(), code: 'X', kind: 'amount' as const, value: '5.00', maxUses: 'many' },
      ],
    }
    expect(draftProblems(draft)).toEqual([
      'Promo code EARLY is listed twice.',
      'Promo code 2 needs a percentage from 1 to 100.',
      'Promo code 3 needs 2 to 30 letters, digits or dashes.',
      'Promo code 3: the number of uses is not a number.',
    ])
  })

  it('keeps the order size from 1 to 100, the most no fewer than the fewest', () => {
    expect(draftProblems({ ...good(), minPerOrder: '0' })).toEqual(['The fewest tickets per order must be from 1 to 100.'])
    expect(draftProblems({ ...good(), minPerOrder: '5', maxPerOrder: '2' })).toEqual(['The most tickets per order is fewer than the fewest.'])
  })

  it('wants https on a payment link', () => {
    expect(draftProblems({ ...good(), paymentLinks: [{ label: 'PayPal', url: 'paypal.me/rim' }] })).toEqual([
      'The payment link "PayPal" must start with https://',
    ])
    expect(draftProblems({ ...good(), paymentLinks: [{ label: 'PayPal', url: 'https://paypal.me/rim' }] })).toEqual([])
  })
})

describe('a saved event back as a draft', () => {
  const full = (): RegistrationEventFull => ({
    event: {
      id: 'e1',
      slug: 'plc-2026',
      title: 'Pastors & Leaders 2026',
      description: null,
      image_path: 'events/x.jpg',
      status: 'published',
      date_mode: 'choose',
      location_name: 'Church Hall',
      address: null,
      latitude: 51.45,
      longitude: -0.97,
      registration_opens_at: null,
      registration_closes_at: at(2026, 11, 20, 23, 59),
      min_per_order: 1,
      max_per_order: 6,
      payment_links: [],
      payment_accounts: [],
      payment_use_church_giving: true,
      payment_note: null,
      allow_pay_at_reception: false,
      add_to_diary: true,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
    },
    dates: [
      { id: 'd1', event_id: 'e1', starts_at: at(2026, 11, 21, 18, 30), ends_at: at(2026, 11, 21, 21, 0), label: null, sort_order: 0, diary_event_id: null },
      { id: 'd2', event_id: 'e1', starts_at: at(2026, 11, 22, 18, 30), ends_at: at(2026, 11, 22, 21, 0), label: 'Day 2', sort_order: 1, diary_event_id: null },
    ],
    ticketTypes: [
      { id: 't1', event_id: 'e1', name: 'With lunch', description: null, kind: 'paid', price_pence: 2050, min_donation_pence: null, quantity: 40, sort_order: 0 },
      { id: 't2', event_id: 'e1', name: 'Give', description: 'What you can', kind: 'donation', price_pence: 0, min_donation_pence: 500, quantity: null, sort_order: 1 },
    ],
    promoCodes: [{ id: 'p1', event_id: 'e1', code: 'EARLY', kind: 'amount', value: 500, ticket_type_ids: ['t1'], max_uses: null, uses: 2, active: true }],
  })

  it('keeps the words, sees the dates share their times, and writes prices as typed', () => {
    const draft = draftFromEvent(full())
    expect(draft).toMatchObject({
      title: 'Pastors & Leaders 2026',
      slug: 'plc-2026',
      slugTouched: true,
      imagePath: 'events/x.jpg',
      dateMode: 'choose',
      sameTimes: true,
      start: '18:30',
      end: '21:00',
      locationName: 'Church Hall',
      latitude: 51.45,
      closesAt: { date: '2026-11-20', time: '23:59' },
      opensAt: { date: '', time: '' },
      maxPerOrder: '6',
      allowPayAtReception: false,
      addToDiary: true,
    })
    expect(draft.dates).toEqual([
      { id: 'd1', date: '2026-11-21', start: '18:30', endDate: '', end: '21:00', label: '' },
      { id: 'd2', date: '2026-11-22', start: '18:30', endDate: '', end: '21:00', label: 'Day 2' },
    ])
    expect(draft.ticketTypes).toEqual([
      { id: 't1', isNew: false, name: 'With lunch', description: '', kind: 'paid', price: '20.50', minDonation: '', quantity: '40' },
      { id: 't2', isNew: false, name: 'Give', description: 'What you can', kind: 'donation', price: '', minDonation: '5.00', quantity: '' },
    ])
    expect(draft.promoCodes).toEqual([{ id: 'p1', code: 'EARLY', kind: 'amount', value: '5.00', ticketTypeIds: ['t1'], maxUses: '', active: true }])
    expect(draftProblems(draft)).toEqual([])
  })

  it('gives each date its own times when they differ', () => {
    const f = full()
    f.dates[1].starts_at = at(2026, 11, 22, 10, 0)
    const draft = draftFromEvent(f)
    expect(draft.sameTimes).toBe(false)
    expect(draft.dates[1]).toMatchObject({ start: '10:00', end: '21:00' })
  })
})

describe('what an order comes to', () => {
  const type = (over: Partial<PublicTicketType>): PublicTicketType => ({
    id: 't',
    name: 'T',
    description: null,
    kind: 'paid',
    price_pence: 2000,
    min_donation_pence: null,
    quantity: null,
    remaining: null,
    remaining_by_date: {},
    ...over,
  })
  const types = [type({ id: 'free', kind: 'free', price_pence: 0 }), type({ id: 'paid' }), type({ id: 'give', kind: 'donation', price_pence: 0 })]

  it('adds up free, paid and donation tickets', () => {
    expect(
      orderTotals(
        types,
        [
          { ticket_type_id: 'free', quantity: 2, attendee_names: [] },
          { ticket_type_id: 'paid', quantity: 1, attendee_names: [] },
          { ticket_type_id: 'give', quantity: 1, attendee_names: [], donation_pence: 750 },
        ],
        null,
      ),
    ).toEqual({ quantity: 4, subtotal: 2750, discount: 0, total: 2750 })
  })

  it('takes a percentage off the paid tickets only', () => {
    const lines = [
      { ticket_type_id: 'paid', quantity: 2, attendee_names: [] },
      { ticket_type_id: 'give', quantity: 1, attendee_names: [], donation_pence: 1000 },
    ]
    expect(orderTotals(types, lines, { ok: true, code: 'EARLY', kind: 'percent', value: 10, ticket_type_ids: [] })).toEqual({
      quantity: 3,
      subtotal: 5000,
      discount: 400,
      total: 4600,
    })
  })

  it('never takes more off than the tickets it covers cost', () => {
    const lines = [{ ticket_type_id: 'paid', quantity: 1, attendee_names: [] }]
    expect(orderTotals(types, lines, { ok: true, code: 'ALL', kind: 'amount', value: 5000, ticket_type_ids: [] })).toMatchObject({ discount: 2000, total: 0 })
    // A code for other tickets takes nothing off these.
    expect(orderTotals(types, lines, { ok: true, code: 'VIP', kind: 'amount', value: 500, ticket_type_ids: ['vip'] })).toMatchObject({ discount: 0, total: 2000 })
    expect(orderTotals(types, lines, { ok: false })).toMatchObject({ discount: 0 })
  })

  it('knows how many are left, per date when people pick one', () => {
    expect(remainingOf(type({ quantity: null }), 'all', null)).toBeNull()
    expect(remainingOf(type({ quantity: 10, remaining: 3 }), 'all', null)).toBe(3)
    expect(remainingOf(type({ quantity: 10, remaining_by_date: { d1: 4 } }), 'choose', 'd1')).toBe(4)
    expect(remainingOf(type({ quantity: 10, remaining_by_date: { d1: 4 } }), 'choose', 'd2')).toBe(10)
    expect(remainingOf(type({ quantity: 10, remaining_by_date: { d1: 4 } }), 'choose', null)).toBe(10)
  })
})

describe('when an event is, in words', () => {
  it('says the day once and both times', () => {
    const words = whenWords(at(2026, 11, 21, 18, 30), at(2026, 11, 21, 21, 0))
    expect(words).toMatch(/21/)
    expect(words).toMatch(/2026/)
    expect(words).toMatch(/6:30/)
    expect(words).toMatch(/9:00/)
    expect(words).toContain(' – ')
  })

  it('names the second day when it ends on one', () => {
    const words = whenWords(at(2026, 12, 31, 22, 0), at(2027, 1, 1, 0, 30))
    expect(words).toMatch(/31/)
    expect(words).toMatch(/\b1\b/)
    expect(words).toMatch(/12:30/)
  })

  it('is just the start when there is no end', () => {
    expect(whenWords(at(2026, 11, 21, 18, 30), null)).not.toContain('–')
  })
})

/* ------------------------------------------------------------------ */
/* Running the event (0245)                                            */
/* ------------------------------------------------------------------ */

const row = (over: Partial<OrderRow>): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: '07700 900123',
  quantity: 2,
  subtotal_pence: 4000,
  discount_pence: 400,
  total_pence: 3600,
  promo_code: 'EARLY',
  payment_status: 'awaiting',
  payment_method: null,
  status: 'confirmed',
  checked_in_at: null,
  notes: null,
  anonymised_at: null,
  created_at: '2026-11-02T10:00:00Z',
  tickets: [
    { ticket_type_id: 't1', attendee_name: 'Ama Owusu', unit_price_pence: 2000 },
    { ticket_type_id: 't1', attendee_name: 'Kofi Owusu', unit_price_pence: 2000 },
  ],
  ...over,
})

describe('finding an order', () => {
  const awaiting = row({})
  const paid = row({ id: 'o2', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', email: 'ben@example.org', payment_status: 'received', promo_code: null })
  const here = row({ id: 'o3', code: 'CDEFGHJKMNPQ', name: 'Grace Mensah', email: 'grace@example.org', payment_status: 'not_needed', total_pence: 0, checked_in_at: '2026-11-21T18:40:00Z' })
  const gone = row({ id: 'o4', code: 'DEFGHJKMNPQR', name: 'Asha Mathew', email: 'asha@example.org', status: 'cancelled', checked_in_at: '2026-11-21T18:40:00Z' })
  const all = [awaiting, paid, here, gone]
  const names = (filter: Parameters<typeof orderMatches>[1], q = '') => all.filter((o) => orderMatches(o, filter, q)).map((o) => o.name)

  it('filters by what is owed, who has arrived, and what was cancelled', () => {
    expect(names('all')).toEqual(['Ama Owusu', 'Ben Joseph', 'Grace Mensah', 'Asha Mathew'])
    expect(names('to_pay')).toEqual(['Ama Owusu'])
    expect(names('paid')).toEqual(['Ben Joseph'])
    // Cancelled after arriving: not here any more.
    expect(names('checked_in')).toEqual(['Grace Mensah'])
    expect(names('cancelled')).toEqual(['Asha Mathew'])
  })

  it('matches a name, an email, a code, a phone, a promo code or an attendee', () => {
    expect(names('all', 'ben')).toEqual(['Ben Joseph'])
    expect(names('all', 'AMA@example')).toEqual(['Ama Owusu'])
    expect(names('all', 'cdefghjkmnpq')).toEqual(['Grace Mensah'])
    expect(names('all', '07700')).toEqual(['Ama Owusu', 'Ben Joseph', 'Grace Mensah', 'Asha Mathew'])
    expect(names('all', 'early')).toEqual(['Ama Owusu', 'Grace Mensah', 'Asha Mathew'])
    expect(names('all', 'kofi')).toEqual(['Ama Owusu', 'Ben Joseph', 'Grace Mensah', 'Asha Mathew'])
    expect(names('to_pay', 'nobody')).toEqual([])
  })
})

describe('the workbook for the accounts', () => {
  const full = (): RegistrationEventFull => ({
    event: {
      id: 'e1',
      slug: 'plc-2026',
      title: 'Pastors & Leaders 2026',
      description: null,
      image_path: null,
      status: 'closed',
      date_mode: 'all',
      location_name: null,
      address: null,
      latitude: null,
      longitude: null,
      registration_opens_at: null,
      registration_closes_at: null,
      min_per_order: 1,
      max_per_order: 10,
      payment_links: [],
      payment_accounts: [],
      payment_use_church_giving: true,
      payment_note: null,
      allow_pay_at_reception: true,
      add_to_diary: false,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
    },
    dates: [{ id: 'd1', event_id: 'e1', starts_at: at(2026, 11, 21, 18, 30), ends_at: null, label: null, sort_order: 0, diary_event_id: null }],
    ticketTypes: [
      { id: 't1', event_id: 'e1', name: 'With lunch', description: null, kind: 'paid', price_pence: 2000, min_donation_pence: null, quantity: 40, sort_order: 0 },
      { id: 't2', event_id: 'e1', name: 'Standard', description: null, kind: 'free', price_pence: 0, min_donation_pence: null, quantity: null, sort_order: 1 },
    ],
    promoCodes: [],
  })
  const orders = [
    row({ payment_method: 'bank', notes: 'Asked for a receipt' }),
    row({ id: 'o2', code: 'BCDEFGHJKMNP', name: 'Ben Joseph', quantity: 1, subtotal_pence: 0, discount_pence: 0, total_pence: 0, promo_code: null, payment_status: 'not_needed', tickets: [{ ticket_type_id: 't2', attendee_name: null, unit_price_pence: 0 }] }),
    row({ id: 'o3', code: 'CDEFGHJKMNPQ', name: 'Asha Mathew', status: 'cancelled', quantity: 1, subtotal_pence: 2000, discount_pence: 0, total_pence: 2000, promo_code: null, tickets: [{ ticket_type_id: 't1', attendee_name: null, unit_price_pence: 2000 }] }),
  ]

  it('has every order, every ticket and the sums, money in pounds', () => {
    const [ordersSheet, ticketsSheet, summary] = buildRegistrationWorkbook(full(), orders)
    expect(ordersSheet.name).toBe('Orders')
    expect(ordersSheet.columns.map((c) => c.label)).toEqual([
      'Code', 'Name', 'Email', 'Phone', 'Date', 'Tickets', 'Subtotal (£)', 'Discount (£)', 'Promo code', 'Total (£)', 'Payment', 'Paid by', 'Status', 'Checked in', 'Registered', 'Notes',
    ])
    expect(ordersSheet.rows[0].slice(0, 4)).toEqual(['ABCDEFGHJKMN', 'Ama Owusu', 'ama@example.org', '07700 900123'])
    expect(ordersSheet.rows[0].slice(5, 13)).toEqual([2, 40, 4, 'EARLY', 36, 'Awaiting payment', 'Bank transfer', 'Registered'])
    expect(ordersSheet.rows[0][15]).toBe('Asked for a receipt')
    expect(ordersSheet.rows[2][12]).toBe('Cancelled')

    expect(ticketsSheet.rows).toEqual([
      ['ABCDEFGHJKMN', 'Ama Owusu', 'With lunch', 'Ama Owusu', 20, 'All dates', 'Registered'],
      ['ABCDEFGHJKMN', 'Ama Owusu', 'With lunch', 'Kofi Owusu', 20, 'All dates', 'Registered'],
      ['BCDEFGHJKMNP', 'Ben Joseph', 'Standard', '', 0, 'All dates', 'Registered'],
      ['CDEFGHJKMNPQ', 'Asha Mathew', 'With lunch', '', 20, 'All dates', 'Cancelled'],
    ])

    expect(summary.rows[0]).toEqual(['With lunch', 20, 2, 40, 40])
    expect(summary.rows[1]).toEqual(['Standard', 'Free', 1, 'No limit', 0])
    expect(summary.rows).toContainEqual(['Registered orders', 2, '', '', ''])
    expect(summary.rows).toContainEqual(['Tickets', 3, '', '', ''])
    expect(summary.rows).toContainEqual(['Cancelled orders', 1, '', '', ''])
    expect(summary.rows).toContainEqual(['Expected (£)', 36, '', '', ''])
    expect(summary.rows).toContainEqual(['Received or waived (£)', 0, '', '', ''])
    expect(summary.rows).toContainEqual(['Still to come (£)', 36, '', '', ''])
  })

  it('names the file after the event and the day', () => {
    expect(registrationExportFileName('plc-2026', new Date(2026, 10, 3, 9, 0))).toBe('registrations-plc-2026-2026-11-03.xlsx')
  })
})

describe('what the Registrations page says about keeping details', () => {
  it('reads the retention setting, and for ever', () => {
    expect(lifespanOf('registrations', { registration_retention_days: 90 })).toContain('blanked 90 days after its last date')
    expect(lifespanOf('registrations', { registration_retention_days: 14 })).toContain('blanked 2 weeks after')
    expect(lifespanOf('registrations', { registration_retention_days: null })).toContain('never blanked')
    expect(lifespanOf('registrations', {})).toContain('90 days')
  })
})
