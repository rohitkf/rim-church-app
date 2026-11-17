import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendTicketAfterPromo } from './promoLater'
import migration from '../../../supabase/migrations/0298_a_promo_code_can_be_put_on_a_registration_already_made.sql?raw'

/*
 * After the church puts a code on somebody's registration (0298), they
 * are told by email — by "your ticket once more" where whoever pressed
 * may send it, and otherwise the way the public page asks, which needs no
 * right. So the attendee hears whoever did it.
 */

const state = vi.hoisted(() => ({
  again: { ok: true, sent: true } as { ok: boolean; sent?: boolean; reason?: string },
  resend: { ok: true, sent: true } as { ok: boolean; sent?: boolean } | Error,
  calls: [] as unknown[],
}))
vi.mock('./registrations', async (original) => ({
  ...(await original<typeof import('./registrations')>()),
  sendTicketAgain: (code: string) => {
    state.calls.push(['again', code])
    return Promise.resolve(state.again)
  },
  resendTickets: (slug: string, email: string) => {
    state.calls.push(['resend', slug, email])
    return state.resend instanceof Error ? Promise.reject(state.resend) : Promise.resolve(state.resend)
  },
}))

const order = { code: 'ABCDEFGHJKMN', email: 'ama@example.org' }

beforeEach(() => {
  state.again = { ok: true, sent: true }
  state.resend = { ok: true, sent: true }
  state.calls = []
})

describe('telling the attendee their registration has a code on it now', () => {
  it('sends their ticket once more, when whoever pressed may', async () => {
    expect(await sendTicketAfterPromo(order, 'plc')).toEqual({ ok: true, sent: true })
    expect(state.calls).toEqual([['again', 'ABCDEFGHJKMN']])
  })

  it('asks the way the public page does when that is refused — approving payments is not correcting addresses', async () => {
    state.again = { ok: false, reason: 'failed' }
    expect(await sendTicketAfterPromo(order, 'plc')).toEqual({ ok: true, sent: true })
    expect(state.calls).toEqual([
      ['again', 'ABCDEFGHJKMN'],
      ['resend', 'plc', 'ama@example.org'],
    ])
  })

  it('never throws: nothing waits on the email', async () => {
    state.again = { ok: false }
    state.resend = new Error('no answer')
    expect(await sendTicketAfterPromo(order, 'plc')).toEqual({ ok: false, reason: 'failed' })
  })

  it('writes to nobody when the registration has no address', async () => {
    expect(await sendTicketAfterPromo({ code: 'ABCDEFGHJKMN', email: null }, 'plc')).toEqual({ ok: true, sent: false })
    expect(state.calls).toEqual([])
  })
})

describe('one sum in the database', () => {
  it('is asked by registering — for a code and for an invitation — and by a code put on afterwards', () => {
    expect(migration).toContain('create or replace function public.registration_discount_on(p_prices int[], p_kind text, p_value int, p_covered int)')
    expect(migration).toContain('discount := public.registration_discount_on(promo_prices, promo.kind, promo.value, promo.tickets_covered);')
    expect(migration).toContain('discount := public.registration_discount_on(eligible, inv.discount_kind, inv.discount_value, inv.tickets_covered);')
    expect(migration).toContain('discount := public.registration_discount_on(prices, promo.kind, promo.value, promo.tickets_covered);')
    // The copies it replaced are gone from the function that registers.
    const register = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.registration_register(p_slug text, p_order jsonb)'))
    expect(register).not.toContain('discountable')
  })

  it('answers yes, and uses the code once, when asked again for the code a registration already carries', () => {
    expect(migration).toMatch(/if o\.promo_code is not null and o\.promo_code = v_code then\s+return jsonb_build_object\('ok', true/)
  })
})
