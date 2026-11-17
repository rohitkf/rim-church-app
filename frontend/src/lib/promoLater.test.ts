import { describe, expect, it } from 'vitest'
import { pounds } from './money'
import { discountOn, duplicateEmails, orderMatches, orderMoney, sharesAnEmail, type OrderRow, type PromoCode } from './registrations'
import { canTakePromo, carriesPromo, promoHeldBy, promoWords, promoWorth, usablePromos } from './promoLater'
import migration from '../../../supabase/migrations/0298_a_promo_code_can_be_put_on_a_registration_already_made.sql?raw'
import removal from '../../../supabase/migrations/0299_a_promo_code_can_be_taken_off_a_registration.sql?raw'

/*
 * A promo code put on a registration already made (0298), and the two
 * things that came with it: telling money received from money waived, and
 * finding the registrations that share an address.
 */

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'o1',
  code: 'ABCDEFGHJKMN',
  date_id: null,
  name: 'Ama Owusu',
  email: 'ama@example.org',
  phone: null,
  quantity: 1,
  subtotal_pence: 2500,
  discount_pence: 0,
  total_pence: 2500,
  promo_code: null,
  invite_id: null,
  payment_status: 'awaiting',
  payment_method: null,
  status: 'confirmed',
  checked_in_at: null,
  notes: null,
  anonymised_at: null,
  created_at: '2026-11-16T21:05:00Z',
  tickets: [{ ticket_type_id: 'adult', attendee_name: null, unit_price_pence: 2500 }],
  ...over,
})
const promo = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: 'p1',
  event_id: 'e1',
  code: 'FREE',
  kind: 'percent',
  value: 100,
  ticket_type_ids: [],
  max_uses: null,
  uses: 0,
  active: true,
  tickets_covered: null,
  ...over,
})
const types = [
  { id: 'adult', kind: 'paid' as const },
  { id: 'child', kind: 'paid' as const },
  { id: 'odd', kind: 'paid' as const },
  { id: 'baby', kind: 'free' as const },
  { id: 'give', kind: 'donation' as const },
]
const tickets = (...prices: [string, number][]) => prices.map(([ticket_type_id, unit_price_pence]) => ({ ticket_type_id, attendee_name: null, unit_price_pence }))

describe('which registrations can take a code afterwards', () => {
  it('one still awaiting its payment, with no discount on it', () => {
    expect(canTakePromo(order())).toBe(true)
  })

  it('not one with a code, an invitation or a discount already', () => {
    expect(canTakePromo(order({ promo_code: 'EARLY', discount_pence: 500, total_pence: 2000 }))).toBe(false)
    expect(canTakePromo(order({ invite_id: 'i1' }))).toBe(false)
    expect(canTakePromo(order({ discount_pence: 500, total_pence: 2000 }))).toBe(false)
  })

  it('not one with a payment recorded, nothing to pay, or cancelled', () => {
    for (const payment_status of ['reported', 'received', 'waived'] as const) expect(canTakePromo(order({ payment_status }))).toBe(false)
    expect(canTakePromo(order({ payment_status: 'not_needed', total_pence: 0, subtotal_pence: 0 }))).toBe(false)
    expect(canTakePromo(order({ status: 'cancelled' }))).toBe(false)
  })
})

describe('which registrations a code can be taken off again (0299)', () => {
  it('a live one with a promo code on it, whether it left something to pay or nothing', () => {
    expect(carriesPromo(order({ promo_code: 'FREE', discount_pence: 2500, total_pence: 0, payment_status: 'not_needed' }))).toBe(true)
    expect(carriesPromo(order({ promo_code: 'FIVER', discount_pence: 500, total_pence: 2000 }))).toBe(true)
  })

  it('not one without a code, one free by invitation, or a cancelled one', () => {
    expect(carriesPromo(order())).toBe(false)
    expect(carriesPromo(order({ invite_id: 'i1', discount_pence: 2500, total_pence: 0, payment_status: 'not_needed' }))).toBe(false)
    expect(carriesPromo(order({ promo_code: 'FREE', status: 'cancelled' }))).toBe(false)
  })

  it('says what must be put right first: a check-in, or a payment recorded', () => {
    expect(promoHeldBy(order({ payment_status: 'not_needed' }))).toBeNull()
    expect(promoHeldBy(order({ payment_status: 'awaiting' }))).toBeNull()
    expect(promoHeldBy(order({ payment_status: 'not_needed', checked_in_at: '2026-11-17T10:00:00Z' }))).toMatch(/undo the check-in first/)
    expect(promoHeldBy(order({ payment_status: 'reported' }))).toMatch(/settle that first/)
    for (const payment_status of ['received', 'waived'] as const) expect(promoHeldBy(order({ payment_status }))).toMatch(/back to awaiting payment first/)
  })
})

describe('which codes are offered', () => {
  it('those turned on, with a use left', () => {
    const codes = [promo({ id: 'a' }), promo({ id: 'b', active: false }), promo({ id: 'c', max_uses: 5, uses: 5 }), promo({ id: 'd', max_uses: 5, uses: 4 })]
    expect(usablePromos(codes).map((c) => c.id)).toEqual(['a', 'd'])
  })
})

describe('what a code comes to on a registration — the same sums as the database', () => {
  // Each is an assert in the 0298 behaviour script too, with these numbers.
  it('a free code on one ticket leaves nothing to pay', () => {
    expect(promoWorth(order(), types, promo())).toEqual({ discount: 2500, total: 0 })
  })

  it('a code that covers one ticket takes the dearest, and leaves the rest', () => {
    const o = order({ subtotal_pence: 8500, tickets: tickets(['child', 1000], ['adult', 2500], ['adult', 2500], ['adult', 2500]) })
    expect(promoWorth(o, types, promo({ tickets_covered: 1 }))).toEqual({ discount: 2500, total: 6000 })
  })

  it('rounds a percentage as registering does', () => {
    const o = order({ subtotal_pence: 5997, tickets: tickets(['odd', 1999], ['odd', 1999], ['odd', 1999]) })
    expect(promoWorth(o, types, promo({ value: 15, tickets_covered: 2 }))).toEqual({ discount: 600, total: 5397 })
  })

  it('takes an amount off, and never more than the tickets come to', () => {
    const o = order({ subtotal_pence: 3500, tickets: tickets(['adult', 2500], ['child', 1000]) })
    expect(promoWorth(o, types, promo({ kind: 'amount', value: 500 }))).toEqual({ discount: 500, total: 3000 })
    expect(promoWorth(o, types, promo({ kind: 'amount', value: 99999 }))).toEqual({ discount: 3500, total: 0 })
  })

  it('counts only the ticket types it is for, and never a free ticket or a donation', () => {
    const o = order({ subtotal_pence: 7000, tickets: tickets(['adult', 2500], ['adult', 2500], ['child', 1000], ['child', 1000]) })
    expect(promoWorth(o, types, promo({ value: 50, ticket_type_ids: ['adult'] }))).toEqual({ discount: 2500, total: 4500 })
    // Nothing off: the database refuses such a code rather than spending it.
    const children = order({ subtotal_pence: 2000, tickets: tickets(['child', 1000], ['child', 1000]) })
    expect(promoWorth(children, types, promo({ value: 50, ticket_type_ids: ['adult'] })).discount).toBe(0)
    const gift = order({ subtotal_pence: 5000, tickets: tickets(['baby', 0], ['give', 5000]) })
    expect(promoWorth(gift, types, promo()).discount).toBe(0)
  })

  it('is the one sum registering uses', () => {
    expect(discountOn([1000, 2500, 2500], { kind: 'percent', value: 100, tickets_covered: 1 })).toBe(2500)
    expect(discountOn([1000, 2500, 2500], { kind: 'percent', value: 50, tickets_covered: null })).toBe(3000)
    expect(discountOn([], { kind: 'amount', value: 500, tickets_covered: null })).toBe(0)
    // It does not reorder the list it was handed.
    const prices = [1000, 2500]
    discountOn(prices, { kind: 'percent', value: 10, tickets_covered: 1 })
    expect(prices).toEqual([1000, 2500])
  })

  it('says what a code gives in a few words', () => {
    expect(promoWords(promo(), pounds)).toBe('100% off')
    expect(promoWords(promo({ tickets_covered: 1 }), pounds)).toBe('100% off, one ticket')
    expect(promoWords(promo({ value: 15, tickets_covered: 2 }), pounds)).toBe('15% off, up to 2 tickets')
    expect(promoWords(promo({ kind: 'amount', value: 500 }), pounds)).toBe('£5.00 off')
  })
})

describe('money received is not money waived', () => {
  it('adds up what came in, what was let go and what is still to come, each on its own', () => {
    const money = orderMoney([
      order({ total_pence: 3000, payment_status: 'received' }),
      order({ total_pence: 3000, payment_status: 'received' }),
      order({ total_pence: 3000, payment_status: 'waived' }),
      order({ total_pence: 2500, payment_status: 'awaiting' }),
      order({ total_pence: 1500, payment_status: 'reported' }),
      order({ total_pence: 0, payment_status: 'not_needed' }),
      // Cancelled: none of it.
      order({ total_pence: 9900, payment_status: 'received', status: 'cancelled' }),
    ])
    // The event this was written for showed £90 received when £60 had come in.
    expect(money).toEqual({ received: 6000, waived: 3000, toCome: 4000, expected: 10000 })
  })

  it('is all noughts for an event with nobody on it', () => {
    expect(orderMoney([])).toEqual({ received: 0, waived: 0, toCome: 0, expected: 0 })
  })
})

describe('registrations that share an email address', () => {
  const rows = [
    order({ id: 'a', email: 'Binitha@Example.com' }),
    order({ id: 'b', email: ' binitha@example.com ', promo_code: 'FREE', total_pence: 0, payment_status: 'not_needed' }),
    order({ id: 'c', email: 'promson@example.com' }),
    order({ id: 'd', email: 'gone@example.com' }),
    order({ id: 'e', email: 'gone@example.com', status: 'cancelled' }),
    order({ id: 'f', email: null }),
    order({ id: 'g', email: null }),
    order({ id: 'h', email: 'anonymised@removed.invalid', anonymised_at: '2027-03-01T03:35:00Z' }),
    order({ id: 'i', email: 'anonymised@removed.invalid', anonymised_at: '2027-03-01T03:35:00Z' }),
  ]
  const dupes = duplicateEmails(rows)

  it('finds an address two live registrations are under, whatever its capitals', () => {
    expect([...dupes]).toEqual(['binitha@example.com'])
  })

  it('does not count a cancelled one, one with no address, or ones whose details were blanked', () => {
    expect(dupes.has('gone@example.com')).toBe(false)
    expect(dupes.has('anonymised@removed.invalid')).toBe(false)
  })

  it('marks both registrations under it, and no others', () => {
    expect(rows.filter((o) => sharesAnEmail(o, dupes)).map((o) => o.id)).toEqual(['a', 'b'])
  })

  it('has a filter of its own, which the words typed still narrow', () => {
    expect(rows.filter((o) => orderMatches(o, 'duplicates', '', dupes)).map((o) => o.id)).toEqual(['a', 'b'])
    expect(rows.filter((o) => orderMatches(o, 'duplicates', 'free', dupes)).map((o) => o.id)).toEqual(['b'])
    // Asked without the list, it finds nothing rather than everything.
    expect(rows.filter((o) => orderMatches(o, 'duplicates', '')).length).toBe(0)
  })
})

describe('the migration and the app agree', () => {
  it('refuses in the words the page shows', () => {
    for (const words of ['That promo code is not valid.', 'This registration already has a discount.', 'That code takes nothing off the tickets on this registration.', 'A payment has already been recorded on this registration.'])
      expect(migration).toContain(words)
  })

  it('offers a code only where the database would take one: the same conditions as canTakePromo', () => {
    expect(migration).toContain("'can_use_promo', coalesce(")
    expect(migration).toMatch(/o\.payment_status = 'awaiting' and o\.total_pence > 0\s+and o\.promo_code is null and o\.promo_code_id is null and o\.invite_id is null and o\.discount_pence = 0/)
  })

  it('holds a code on a registration for the same two reasons the menu gives (0299)', () => {
    expect(removal).toContain("if o.checked_in_at is not null then")
    expect(removal).toContain("if o.payment_status not in ('not_needed', 'awaiting') then")
    for (const words of ['This registration has been checked in. Undo the check-in first.', 'A payment has already been recorded on this registration.', 'The discount on this registration came with an invite link, not a promo code.'])
      expect(removal).toContain(words)
  })

  it('takes a code off for whoever may approve payments, and never for a visitor (0299)', () => {
    expect(removal).toContain("if not public.registration_can(auth.uid(), 'approve') then")
    expect(removal).toContain('revoke all on function public.registration_order_remove_promo(uuid) from public, anon;')
    expect(removal).toContain('grant execute on function public.registration_order_remove_promo(uuid) to authenticated;')
  })

  it('uses the code again when taking it off is undone, and refuses when it cannot (0299)', () => {
    expect(removal).toContain('update public.registration_promo_codes set uses = uses + 1 where id = code_back;')
    for (const words of ['That promo code has been deleted since.', 'That promo code has been used again since, and has no uses left.']) expect(removal).toContain(words)
  })

  it('lets Undo put the price back', () => {
    for (const key of ["'discount_pence', o.discount_pence", "'total_pence', o.total_pence", "'promo_code', o.promo_code", "'promo_code_id', o.promo_code_id"]) expect(migration).toContain(key)
  })
})
