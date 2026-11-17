import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerForEvent, type OrderRequest } from './registrations'
import waits from '../../../supabase/migrations/0297_a_personal_invitations_ticket_goes_to_its_address.sql?raw'
import covers from '../../../supabase/migrations/0296_a_code_covers_as_many_tickets_as_it_says.sql?raw'

/*
 * What registering answers (0297), read from what the database says: the
 * order's code, or — for a personal invitation — that the ticket went by
 * email and there is no code to go to. And the words the two sides share
 * with the migrations that say them.
 */

const state = vi.hoisted(() => ({ answer: null as unknown, calls: [] as unknown[] }))
vi.mock('./supabaseClient', () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      state.calls.push([fn, args])
      return Promise.resolve({ data: state.answer, error: null })
    },
  },
}))

const order: OrderRequest = { name: 'Ama', email: 'ama@example.org', phone: '', date_id: null, promo_code: '', lines: [], website: '' }

beforeEach(() => {
  state.calls = []
})

describe('what registering answers', () => {
  it('is the order’s code, as ever', async () => {
    state.answer = { ok: true, code: 'ABCDEFGHJKMN', by_email: false }
    expect(await registerForEvent('plc', order)).toEqual({ code: 'ABCDEFGHJKMN', byEmail: false })
    expect(state.calls).toEqual([['registration_register', { p_slug: 'plc', p_order: order }]])
  })

  it('is the code from a database that does not say by_email yet', async () => {
    state.answer = { ok: true, code: 'ABCDEFGHJKMN' }
    expect(await registerForEvent('plc', order)).toEqual({ code: 'ABCDEFGHJKMN', byEmail: false })
  })

  it('is “by email”, with no code, for a personal invitation', async () => {
    state.answer = { ok: true, code: null, by_email: true }
    expect(await registerForEvent('plc', order)).toEqual({ code: null, byEmail: true })
  })

  it('is neither for the trap’s answer, or for none at all', async () => {
    state.answer = { ok: true, code: null }
    expect(await registerForEvent('plc', order)).toEqual({ code: null, byEmail: false })
    state.answer = null
    expect(await registerForEvent('plc', order)).toEqual({ code: null, byEmail: false })
  })
})

describe('the migrations say what the app reads', () => {
  it('0297 answers by_email, and keeps the code back only for an invitation kept to an address', () => {
    expect(waits).toContain("'by_email', inv.locked_email is not null")
    expect(waits).toContain("'code', case when inv.locked_email is not null then null else v_code end")
  })

  it('0296 tells the form how many tickets a code covers, and keeps the code off the ticket', () => {
    expect(covers).toContain("'tickets_covered', p.tickets_covered")
    expect(covers).toContain("'promo_code', null::text")
    expect(covers).toContain("'promo', o.promo_code is not null")
  })
})
