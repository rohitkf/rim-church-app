import { describe, expect, it } from 'vitest'
import { orderTotals, type InviteDiscount, type OrderLine, type PublicTicketType } from './registrations'
import {
  FREE_GROUP_MAX,
  INVITE_GONE,
  discountOf,
  discountWords,
  inviteCheckSchema,
  inviteGives,
  inviteNames,
  inviteOffer,
  inviteProblems,
  inviteRow,
  inviteState,
  inviteTokenFrom,
  inviteUses,
  newInviteDraft,
  usesWords,
  type Invite,
  type InviteDraft,
} from './registrationInvites'
import migration from '../../../supabase/migrations/0295_an_invitation_is_a_link_not_a_code_to_be_told.sql?raw'

/*
 * Invitation links (0295): the sums the form shows, which have to be the
 * database's to the penny; what a link is worth in words; and the form
 * that makes one, which has to stop what the table's checks would refuse.
 */

const type = (id: string, price: number, kind: PublicTicketType['kind'] = 'paid'): PublicTicketType => ({
  id,
  name: id,
  description: null,
  kind,
  price_pence: price,
  min_donation_pence: null,
  quantity: null,
  remaining: null,
  remaining_by_date: {},
})
const types = [type('adult', 2500), type('child', 1000), type('odd', 1999), type('baby', 0, 'free'), type('give', 0, 'donation')]
const line = (id: string, quantity: number, donation?: number): OrderLine => ({ ticket_type_id: id, quantity, attendee_names: [], donation_pence: donation })
const off = (over: Partial<InviteDiscount> = {}): InviteDiscount => ({ kind: 'percent', value: 100, ticket_type_ids: [], tickets_covered: 1, ...over })

describe('what an invitation takes off — the same sums as registration_register()', () => {
  // Each of these is an assert in the migration's behaviour script too, with the same numbers.
  it('covers one ticket, the dearest, and charges the rest in full', () => {
    expect(orderTotals(types, [line('child', 1), line('adult', 2), line('baby', 1)], null, off())).toEqual({ quantity: 4, subtotal: 6000, discount: 2500, total: 3500 })
  })

  it('makes a single ticket wholly free', () => {
    expect(orderTotals(types, [line('adult', 1)], null, off())).toMatchObject({ discount: 2500, total: 0 })
  })

  it('covers as many as it says, dearest first across ticket types', () => {
    const lines = [line('child', 1), line('odd', 1), line('adult', 2)]
    expect(orderTotals(types, lines, null, off({ tickets_covered: 3 }))).toMatchObject({ discount: 2500 + 2500 + 1999, total: 1000 })
  })

  it('rounds a percentage as the database does: 15% of two £19.99 tickets is £6.00', () => {
    expect(orderTotals(types, [line('odd', 3)], null, off({ value: 15, tickets_covered: 2 }))).toMatchObject({ subtotal: 5997, discount: 600 })
  })

  it('takes an amount off the order, and never more than the covered tickets come to', () => {
    const tenner = off({ kind: 'amount', value: 1000 })
    expect(orderTotals(types, [line('child', 2)], null, tenner)).toMatchObject({ subtotal: 2000, discount: 1000 })
    expect(orderTotals(types, [line('adult', 1)], null, tenner)).toMatchObject({ discount: 1000, total: 1500 })
    expect(orderTotals(types, [line('child', 1)], null, off({ kind: 'amount', value: 5000 }))).toMatchObject({ discount: 1000, total: 0 })
  })

  it('takes nothing off a ticket type it is not for, a free ticket or a donation', () => {
    const adultsOnly = off({ value: 50, ticket_type_ids: ['adult'] })
    expect(orderTotals(types, [line('child', 2)], null, adultsOnly)).toMatchObject({ discount: 0, total: 2000 })
    expect(orderTotals(types, [line('child', 1), line('adult', 2)], null, adultsOnly)).toMatchObject({ discount: 1250 })
    expect(orderTotals(types, [line('baby', 2), line('give', 1, 5000)], null, off())).toMatchObject({ discount: 0, total: 5000 })
  })

  it('wins over a code: the two are never both taken', () => {
    const half = { ok: true as const, code: 'HALF', kind: 'percent' as const, value: 50, ticket_type_ids: [] }
    // A code alone takes half off both tickets; with an invitation it takes nothing, and the invitation one ticket.
    expect(orderTotals(types, [line('adult', 2)], half)).toMatchObject({ discount: 2500 })
    expect(orderTotals(types, [line('adult', 2)], half, off())).toMatchObject({ discount: 2500, total: 2500 })
    expect(orderTotals(types, [line('adult', 2)], half, off({ value: 10 }))).toMatchObject({ discount: 250 })
  })

  it('with nothing chosen, takes nothing off', () => {
    expect(orderTotals(types, [], null, off())).toEqual({ quantity: 0, subtotal: 0, discount: 0, total: 0 })
  })
})

describe('what a link is worth, in words', () => {
  it('says free tickets as free tickets', () => {
    expect(discountWords(off())).toBe('1 free ticket')
    expect(discountWords(off({ tickets_covered: 3 }))).toBe('3 free tickets')
  })

  it('says a percentage with how many tickets it reaches', () => {
    expect(discountWords(off({ value: 50 }))).toBe('50% off 1 ticket')
    expect(discountWords(off({ value: 50, tickets_covered: 2 }))).toBe('50% off up to 2 tickets')
  })

  it('says an amount as money, and notes when only some tickets count', () => {
    expect(discountWords(off({ kind: 'amount', value: 1000 }))).toBe('£10.00 off')
    expect(discountWords(off({ kind: 'amount', value: 1000, ticket_type_ids: ['adult'] }))).toBe('£10.00 off some tickets')
    expect(discountWords(off({ ticket_type_ids: ['adult'] }))).toBe('1 free ticket (some kinds)')
  })

  it('tells the person there is nothing to type, and says so plainly when there is no discount', () => {
    expect(inviteOffer({ ok: true, email_locked: false, discount: off() })).toBe('1 free ticket, taken off for you below. There is no code to type.')
    expect(inviteOffer({ ok: true, email_locked: false, discount: null })).toBe('Register below as usual.')
  })

  it('has words for every reason a link stops working, each saying they can still register', () => {
    for (const reason of ['used', 'ended', 'not_found'] as const) {
      expect(INVITE_GONE[reason].title).toBeTruthy()
      expect(INVITE_GONE[reason].body).toMatch(/still register/)
    }
  })
})

describe('what the database says of a link', () => {
  it('reads a working link, with and without a discount', () => {
    expect(inviteCheckSchema.parse({ ok: true, email_locked: true, discount: { kind: 'percent', value: 100, ticket_type_ids: [], tickets_covered: 1 } })).toEqual({
      ok: true,
      email_locked: true,
      discount: off(),
    })
    expect(inviteCheckSchema.parse({ ok: true, email_locked: false, discount: null })).toEqual({ ok: true, email_locked: false, discount: null })
  })

  it('reads a null true/false as false rather than refusing the whole answer', () => {
    expect(inviteCheckSchema.parse({ ok: true, email_locked: null, discount: null })).toMatchObject({ email_locked: false })
  })

  it('reads a reason it does not know as a link that leads nowhere', () => {
    expect(inviteCheckSchema.parse({ ok: false, reason: 'used' })).toEqual({ ok: false, reason: 'used' })
    expect(inviteCheckSchema.parse({ ok: false, reason: 'something new' })).toEqual({ ok: false, reason: 'not_found' })
    expect(inviteCheckSchema.parse({ ok: false })).toEqual({ ok: false, reason: 'not_found' })
  })

  it('takes a token from the link only when it is one', () => {
    expect(inviteTokenFrom('?invite=k7qm2xpa9r4t')).toBe('K7QM2XPA9R4T')
    expect(inviteTokenFrom('?x=1&invite=%20K7QM2XPA9R4T%20')).toBe('K7QM2XPA9R4T')
    expect(inviteTokenFrom('?invite=short')).toBeNull()
    expect(inviteTokenFrom('?invite=K7QM2XPA9R4T<script>')).toBeNull()
    expect(inviteTokenFrom('')).toBeNull()
  })
})

const invite = (over: Partial<Invite> = {}): Invite => ({
  id: 'i1',
  event_id: 'e1',
  token: 'K7QM2XPA9R4T',
  label: 'John Smith',
  kind: 'personal',
  locked_email: 'john@example.com',
  discount_kind: 'percent',
  discount_value: 100,
  ticket_type_ids: [],
  tickets_covered: 1,
  max_uses: 1,
  expires_at: null,
  active: true,
  anonymised_at: null,
  created_at: '2026-11-16T10:00:00Z',
  ...over,
})

describe('where a link stands, for the office', () => {
  const now = new Date('2026-11-16T12:00:00Z')

  it('counts a link’s uses from its live orders, so a cancelled order gives its use back', () => {
    const uses = inviteUses([
      { invite_id: 'i1', status: 'confirmed' },
      { invite_id: 'i1', status: 'cancelled' },
      { invite_id: 'i2', status: 'confirmed' },
      { invite_id: 'i2', status: 'confirmed' },
      { invite_id: null, status: 'confirmed' },
    ])
    expect(uses).toEqual({ i1: 1, i2: 2 })
  })

  it('is live until it is turned off, runs out, is used up or is blanked', () => {
    expect(inviteState(invite(), 0, now)).toBe('live')
    expect(inviteState(invite(), 1, now)).toBe('used')
    expect(inviteState(invite({ active: false }), 0, now)).toBe('off')
    expect(inviteState(invite({ expires_at: '2026-11-16T11:59:00Z' }), 0, now)).toBe('ended')
    expect(inviteState(invite({ expires_at: '2026-11-16T12:01:00Z' }), 0, now)).toBe('live')
    expect(inviteState(invite({ anonymised_at: '2027-03-01T03:35:00Z', active: false }), 1, now)).toBe('removed')
    // No limit: never used up.
    expect(inviteState(invite({ kind: 'group', max_uses: null, locked_email: null }), 500, now)).toBe('live')
  })

  it('says how much of it has been used', () => {
    expect(usesWords(invite(), 0)).toBe('Not used yet')
    expect(usesWords(invite(), 1)).toBe('Used')
    expect(usesWords(invite({ kind: 'group', max_uses: 20 }), 14)).toBe('14 of 20 used')
    expect(usesWords(invite({ kind: 'group', max_uses: null }), 9)).toBe('9 used')
  })

  it('says what it gives, or that it gives no discount', () => {
    expect(inviteGives(invite())).toBe('1 free ticket')
    expect(inviteGives(invite({ discount_kind: null, discount_value: null }))).toBe('No discount')
    expect(discountOf(invite({ discount_kind: null, discount_value: null }))).toBeNull()
  })

  it('names each link by its id, for the orders and the export', () => {
    expect(inviteNames([invite(), invite({ id: 'i2', label: 'Youth' })])).toEqual({ i1: 'John Smith', i2: 'Youth' })
  })
})

describe('the form that makes a link', () => {
  const now = new Date(2026, 10, 16, 12, 0)
  const draft = (over: Partial<InviteDraft> = {}): InviteDraft => ({ ...newInviteDraft(), label: 'John Smith', email: 'john@example.com', ...over })
  const fields = (d: InviteDraft) => inviteProblems(d, now).map((p) => p.field)

  it('starts as a personal link for one free ticket', () => {
    expect(newInviteDraft()).toMatchObject({ kind: 'personal', discount: 'percent', value: '100', ticketsCovered: '1' })
  })

  it('takes a personal link with a name and an address', () => {
    expect(inviteProblems(draft(), now)).toEqual([])
  })

  it('wants a name, and for a personal link an address that looks like one', () => {
    expect(fields(draft({ label: '  ' }))).toEqual(['label'])
    expect(fields(draft({ label: 'x'.repeat(81) }))).toEqual(['label'])
    expect(fields(draft({ email: '' }))).toEqual(['email'])
    expect(fields(draft({ email: 'john@' }))).toEqual(['email'])
  })

  it('refuses an address whose ending does not exist, and says the one that was meant', () => {
    expect(inviteProblems(draft({ email: 'john@gmail.con' }), now)).toEqual([
      { field: 'email', text: 'Email addresses do not end in “.con”. Check the end of yours. Did you mean john@gmail.com?' },
    ])
  })

  it('wants a discount that is one', () => {
    expect(fields(draft({ value: '0' }))).toEqual(['value'])
    expect(fields(draft({ value: '101' }))).toEqual(['value'])
    expect(fields(draft({ value: '12.5' }))).toEqual(['value'])
    expect(fields(draft({ discount: 'amount', value: '' }))).toEqual(['value'])
    expect(fields(draft({ discount: 'amount', value: '5.00' }))).toEqual([])
    expect(fields(draft({ ticketsCovered: '0' }))).toEqual(['covered'])
    expect(fields(draft({ limited: true, ticketTypeIds: [] }))).toEqual(['tickets'])
  })

  it('wants a limit on a group link with a discount, and none on one without', () => {
    const group = (over: Partial<InviteDraft> = {}) => draft({ kind: 'group', email: '', value: '50', ...over })
    expect(fields(group())).toEqual(['uses'])
    expect(fields(group({ maxUses: '30' }))).toEqual([])
    expect(fields(group({ maxUses: 'lots' }))).toEqual(['uses'])
    expect(fields(group({ discount: 'none' }))).toEqual([])
    // An address typed before switching to group does not count against it.
    expect(fields(draft({ kind: 'group', email: 'nonsense', value: '50', maxUses: '5' }))).toEqual([])
  })

  it(`lets a group link make tickets free for ${FREE_GROUP_MAX} uses and no more`, () => {
    const free = (maxUses: string) => draft({ kind: 'group', email: '', value: '100', maxUses })
    expect(fields(free(String(FREE_GROUP_MAX)))).toEqual([])
    expect(fields(free(String(FREE_GROUP_MAX + 1)))).toEqual(['uses'])
  })

  it('will not end on a day that has gone', () => {
    expect(fields(draft({ until: '2026-11-15' }))).toEqual(['until'])
    expect(fields(draft({ until: '2026-11-16' }))).toEqual([])
  })

  it('becomes the row the database takes: one use and its address for a personal link', () => {
    expect(inviteRow('e1', draft({ label: '  John Smith ', email: ' John@Example.com ' }))).toEqual({
      event_id: 'e1',
      label: 'John Smith',
      kind: 'personal',
      locked_email: 'john@example.com',
      discount_kind: 'percent',
      discount_value: 100,
      ticket_type_ids: [],
      tickets_covered: 1,
      max_uses: 1,
      expires_at: null,
    })
  })

  it('becomes a group row with no address, money in pence, and its ticket types only when kept to some', () => {
    const row = inviteRow('e1', draft({ kind: 'group', discount: 'amount', value: '7.50', maxUses: '30', limited: true, ticketTypeIds: ['adult'], ticketsCovered: '2', until: '2026-12-01' }))
    expect(row).toMatchObject({ kind: 'group', locked_email: null, discount_kind: 'amount', discount_value: 750, ticket_type_ids: ['adult'], tickets_covered: 2, max_uses: 30 })
    // The whole of its last day.
    expect(new Date(row.expires_at!).getTime()).toBe(new Date(2026, 11, 1, 23, 59).getTime())
  })

  it('carries no discount, no ticket types and no limit when it only records who came', () => {
    expect(inviteRow('e1', draft({ kind: 'group', discount: 'none', limited: true, ticketTypeIds: ['adult'], ticketsCovered: '9' }))).toMatchObject({
      discount_kind: null,
      discount_value: null,
      ticket_type_ids: [],
      tickets_covered: 1,
      max_uses: null,
    })
  })

  it('never sends a token: the database makes it', () => {
    expect(Object.keys(inviteRow('e1', draft()))).not.toContain('token')
  })
})

describe('the migration and the app say the same things', () => {
  it('holds a free group link to the same number of uses', () => {
    expect(migration).toContain(`coalesce(max_uses, 10000) > ${FREE_GROUP_MAX}`)
  })

  it('answers the reasons the app has words for, and no others', () => {
    const reasons = [...migration.matchAll(/'reason', '([a-z_]+)'/g)].map((m) => m[1])
    expect([...new Set(reasons)].sort()).toEqual(Object.keys(INVITE_GONE).sort())
  })
})
