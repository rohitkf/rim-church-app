import { describe, expect, it } from 'vitest'
import { NO_FILTERS, anyFilter, filterWords, orderFits, orderMatches, orderSays, statusOf, wayFilters, withStatus, type OrderFilters } from './orderFilters'
import { onlineLinkName, ticketBreakdown } from './registrationBreakdown'
import { duplicateEmails, type OrderRow } from './registrations'

let n = 0
const row = (over: Partial<OrderRow>): OrderRow => ({
  id: `o${(n += 1)}`,
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: `p${n}@example.org`,
  phone: '07700 900123',
  quantity: 1,
  subtotal_pence: 3000,
  discount_pence: 0,
  total_pence: 3000,
  promo_code: null,
  payment_status: 'awaiting',
  payment_method: null,
  status: 'confirmed',
  checked_in_at: null,
  notes: null,
  anonymised_at: null,
  created_at: '2026-11-02T10:00:00Z',
  tickets: [{ ticket_type_id: 't1', attendee_name: 'Kofi Owusu', unit_price_pence: 3000 }],
  ...over,
})

const people = [
  row({ name: 'Bank Receipt', payment_method: 'bank', payment_status: 'reported' }),
  row({ name: 'Bank Paid', payment_method: 'bank', payment_status: 'received', payment_verified_at: '2026-11-19T10:00:00Z' }),
  row({ name: 'Link Receipt', payment_method: 'paypal', payment_status: 'reported' }),
  row({ name: 'Link Paid', payment_method: 'paypal', payment_status: 'received' }),
  row({ name: 'Door Later', payment_method: 'reception' }),
  row({ name: 'Door Paid', payment_method: 'reception', payment_status: 'received', checked_in_at: '2026-11-21T18:40:00Z' }),
  row({ name: 'Undecided' }),
  row({ name: 'Code Free', promo_code: 'EARLY', discount_pence: 3000, total_pence: 0, payment_status: 'not_needed' }),
  row({ name: 'Let Off', payment_method: 'reception', payment_status: 'waived' }),
  row({ name: 'Gone', payment_method: 'bank', status: 'cancelled' }),
]
const names = (f: Partial<OrderFilters>, q = '') => people.filter((o) => orderMatches(o, { ...NO_FILTERS, ...f }, q)).map((o) => o.name)

describe('finding registrations: where each stands, and how it is paid', () => {
  it('shows everybody, the cancelled too, when nothing is chosen', () => {
    expect(names({})).toHaveLength(people.length)
    expect(anyFilter(NO_FILTERS)).toBe(false)
  })

  it('by where the money stands: each live registration is in exactly one', () => {
    expect(names({ payment: 'awaiting' })).toEqual(['Door Later', 'Undecided'])
    expect(names({ payment: 'reported' })).toEqual(['Bank Receipt', 'Link Receipt'])
    expect(names({ payment: 'received' })).toEqual(['Bank Paid', 'Link Paid', 'Door Paid'])
    expect(names({ payment: 'free' })).toEqual(['Code Free'])
    expect(names({ payment: 'waived' })).toEqual(['Let Off'])
    const live = people.filter((o) => o.status === 'confirmed')
    const placed = (['awaiting', 'reported', 'received', 'free', 'waived'] as const).flatMap((payment) => names({ payment }))
    expect(placed.sort()).toEqual(live.map((o) => o.name).sort())
  })

  it('by how it is paid: bank transfer, the online link, at reception, or not chosen', () => {
    expect(names({ way: 'bank' })).toEqual(['Bank Receipt', 'Bank Paid'])
    expect(names({ way: 'paypal' })).toEqual(['Link Receipt', 'Link Paid'])
    expect(names({ way: 'reception' })).toEqual(['Door Later', 'Door Paid'])
    expect(names({ way: 'none' })).toEqual(['Undecided'])
  })

  it('tells paid at reception from still to pay at reception: the two chosen together narrow', () => {
    expect(names({ payment: 'received', way: 'reception' })).toEqual(['Door Paid'])
    expect(names({ payment: 'awaiting', way: 'reception' })).toEqual(['Door Later'])
    expect(names({ payment: 'reported', way: 'bank' })).toEqual(['Bank Receipt'])
    expect(names({ payment: 'reported', way: 'paypal' })).toEqual(['Link Receipt'])
    // Nothing at the door is ever "a receipt to check".
    expect(names({ payment: 'reported', way: 'reception' })).toEqual([])
  })

  it('leaves the cancelled, the free and the waived out of a way of paying', () => {
    expect(names({ way: 'bank' })).not.toContain('Gone')
    expect(names({ way: 'reception' })).not.toContain('Let Off')
    expect(names({ payment: 'awaiting' })).not.toContain('Gone')
    expect(names({ only: 'cancelled' })).toEqual(['Gone'])
  })

  it('shows only one more thing, across the rest', () => {
    // Said to be paid and not verified: a receipt, or marked paid.
    expect(names({ only: 'to_verify' })).toEqual(['Bank Receipt', 'Link Receipt', 'Link Paid', 'Door Paid'])
    expect(names({ only: 'to_verify', way: 'paypal' })).toEqual(['Link Receipt', 'Link Paid'])
    expect(names({ only: 'checked_in' })).toEqual(['Door Paid'])
    expect(names({ only: 'refunds' })).toEqual([])
  })

  it('has a filter for emails that did not arrive, on registrations still live (0283)', () => {
    const list = [
      row({ name: 'Jerry Typo', email_status: 'bounced' }),
      row({ name: 'Held Back', email_status: 'suppressed' }),
      row({ name: 'Not Sent', email_status: 'failed' }),
      row({ name: 'Arrived', email_status: 'delivered' }),
      row({ name: 'Delayed', email_status: 'delayed' }),
      row({ name: 'Cancelled Bounce', email_status: 'bounced', status: 'cancelled' }),
      row({ name: 'No Address', email: null, email_status: 'bounced' }),
    ]
    const only = { ...NO_FILTERS, only: 'email' as const }
    expect(list.filter((o) => orderMatches(o, only, '')).map((o) => o.name)).toEqual(['Jerry Typo', 'Held Back', 'Not Sent'])
    expect(list.filter((o) => orderMatches(o, only, 'held')).map((o) => o.name)).toEqual(['Held Back'])
  })

  it('finds the same email twice only when told which addresses are shared', () => {
    const twice = [row({ name: 'First', email: 'same@example.org' }), row({ name: 'Second', email: 'SAME@example.org' }), row({ name: 'Other' })]
    const only = { ...NO_FILTERS, only: 'duplicates' as const }
    expect(twice.filter((o) => orderFits(o, only, duplicateEmails(twice))).map((o) => o.name)).toEqual(['First', 'Second'])
    expect(twice.filter((o) => orderFits(o, only)).length).toBe(0)
  })

  it('matches a name, an email, a code, a phone, a promo code or an attendee, with or without a filter', () => {
    expect(names({}, 'door')).toEqual(['Door Later', 'Door Paid'])
    expect(names({ payment: 'received' }, 'door')).toEqual(['Door Paid'])
    expect(names({}, 'early')).toEqual(['Code Free'])
    expect(names({}, 'kofi')).toHaveLength(people.length)
    expect(names({}, '07700')).toHaveLength(people.length)
    expect(names({ payment: 'awaiting' }, 'nobody')).toEqual([])
    const walk = row({ email: null, phone: null, name: 'Walk In', code: 'WALKIN123456', source: 'walk_in' })
    expect(orderSays(walk, 'walk')).toBe(true)
    expect(orderSays(walk, 'WALKIN')).toBe(true)
    expect(orderSays(walk, 'example.org')).toBe(false)
  })

  it('counts the same people as the same line of "How the tickets are paid for"', () => {
    const { groups } = ticketBreakdown(people)
    const line = (group: string, label: string) => groups.find((g) => g.title === group)?.lines.find((l) => l.label === label)?.orders ?? 0
    expect(names({ way: 'bank', payment: 'reported' })).toHaveLength(line('Bank transfer', 'Receipt sent, to check'))
    expect(names({ way: 'reception', payment: 'awaiting' })).toHaveLength(line('At reception', 'Not paid yet'))
    expect(names({ way: 'none' })).toHaveLength(groups.find((g) => g.title === 'Way of paying not chosen')!.orders)
    expect(names({ payment: 'free' })).toHaveLength(groups.find((g) => g.title === 'Nothing to pay')!.orders)
    expect(names({ way: 'paypal' })).toHaveLength(groups.find((g) => g.title === 'Online link')!.orders)
  })
})

describe('the Status dropdown is one choice', () => {
  it('reads as everybody, a payment, or one other thing', () => {
    expect(statusOf(NO_FILTERS)).toBe('all')
    expect(statusOf({ payment: 'received', way: 'any', only: null })).toBe('payment:received')
    expect(statusOf({ payment: 'all', way: 'bank', only: 'cancelled' })).toBe('only:cancelled')
  })

  it('sets one and lets go of the other, and leaves the payment method alone', () => {
    const paidAtDoor: OrderFilters = { payment: 'received', way: 'reception', only: null }
    expect(withStatus(paidAtDoor, 'only:checked_in')).toEqual({ payment: 'all', way: 'reception', only: 'checked_in' })
    expect(withStatus({ payment: 'all', way: 'reception', only: 'checked_in' }, 'payment:awaiting')).toEqual({ payment: 'awaiting', way: 'reception', only: null })
    expect(withStatus(paidAtDoor, 'all')).toEqual({ payment: 'all', way: 'reception', only: null })
  })

  it('round-trips: what it is set to is what it says', () => {
    for (const choice of ['all', 'payment:free', 'payment:reported', 'only:to_verify', 'only:duplicates'] as const) {
      expect(statusOf(withStatus(NO_FILTERS, choice))).toBe(choice)
    }
  })
})

describe('what is chosen, said back in words', () => {
  it('names each choice, in the order of the rows', () => {
    expect(filterWords(NO_FILTERS)).toBe('')
    expect(filterWords({ payment: 'received', way: 'reception', only: null })).toBe('Paid · At reception')
    expect(filterWords({ payment: 'reported', way: 'bank', only: 'to_verify' })).toBe('Receipt to check · Bank transfer · Payment to verify')
    expect(filterWords({ payment: 'all', way: 'none', only: null })).toBe('Not chosen yet')
  })

  it('calls the online link by its own name where the event’s links share one', () => {
    expect(onlineLinkName(['Paypal'])).toBe('Paypal')
    expect(onlineLinkName(['Paypal', ' paypal '])).toBe('Paypal')
    // Two different links, or none: nothing truer to say than what it is.
    expect(onlineLinkName(['Paypal', 'Stripe'])).toBe('Online link')
    expect(onlineLinkName([])).toBe('Online link')
    expect(onlineLinkName(['', null])).toBe('Online link')
    expect(wayFilters('Paypal').map((w) => w.label)).toEqual(['Any payment method', 'Bank transfer', 'Paypal', 'At reception', 'Not chosen yet'])
    expect(wayFilters().map((w) => w.label)).toEqual(['Any payment method', 'Bank transfer', 'Online link', 'At reception', 'Not chosen yet'])
    expect(filterWords({ payment: 'received', way: 'paypal', only: null }, 'Paypal')).toBe('Paid · Paypal')
    expect(ticketBreakdown(people, 'Paypal').groups.map((g) => g.title)).toContain('Paypal')
  })
})
