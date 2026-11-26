import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import { orderActions } from './orderActions'
import type { OrderRow } from './registrations'
import type { RegistrationRights } from './registrationRights'
import refunds from '../../../supabase/migrations/0336_a_refund_is_owed_for_money_that_arrived.sql?raw'

/*
 * A refund is owed only for money the church has confirmed arrived
 * (0336). Somebody could say "I have paid", cancel, and be listed as owed
 * a refund with nothing having arrived. The Owner chose: only once
 * confirmed. So a cancelled registration that was only said to be paid
 * owes nothing, and the office saying the money did arrive is what owes it.
 */
const all = { office: true, door: true, edit: true, approve: true, takePayment: true, refund: true, cancel: true, delete: true, checkIn: true, walkIn: true, verify: true, email: true, fix: true, waive: true, promo: true, cancelOrder: true, note: true } as unknown as RegistrationRights
const order = (over: Partial<OrderRow>): OrderRow =>
  ({ id: 'o1', code: 'ABCDEFGHJKLM', name: 'Grace Mensah', email: 'grace@example.org', status: 'confirmed', total_pence: 2000, subtotal_pence: 2000, discount_pence: 0, payment_status: 'awaiting', payment_method: 'bank', refund_status: null, payment_verified_at: null, checked_in_at: null, tickets: [], ...over }) as unknown as OrderRow
const acted: string[] = []
const labels = (o: OrderRow, eventCancelled = false, r: RegistrationRights = all) =>
  orderActions(o, (a) => acted.push(a), () => {}, () => {}, () => {}, eventCancelled, () => {}, r, () => acted.push('verify'), () => {}).map((a) => a.label)

describe('a registration that was only said to be paid, and is not going ahead', () => {
  const saidSo = order({ status: 'cancelled', payment_status: 'reported' })

  it('has no refund to mark, and offers the one thing that would owe it', () => {
    const offered = labels(saidSo)
    expect(offered).not.toContain('Mark as refunded')
    expect(offered).not.toContain('Where to send the refund')
    expect(offered).toContain('The payment did arrive')
  })

  it('marks it paid when pressed, which is what the database turns into a refund owed', () => {
    acted.length = 0
    orderActions(saidSo, (a) => acted.push(a), () => {}, () => {}, () => {}, false, () => {}, all, () => {}, () => {})
      .find((a) => a.label === 'The payment did arrive')!
      .onSelect()
    expect(acted).toEqual(['received'])
  })

  it('offers it only to whoever may take payments', () => {
    expect(labels(saidSo, false, { ...all, takePayment: false })).not.toContain('The payment did arrive')
  })

  it('offers it on a cancelled event too, and verifying to whoever verifies', () => {
    const onCancelledEvent = order({ status: 'confirmed', payment_status: 'reported' })
    expect(labels(onCancelledEvent, true)).toEqual(expect.arrayContaining(['The payment did arrive', 'Verify payment']))
    expect(labels(onCancelledEvent, true, { ...all, verify: false })).not.toContain('Verify payment')
  })

  it('offers neither once a refund is owed, or where nothing was ever said to be paid', () => {
    expect(labels(order({ status: 'cancelled', payment_status: 'received', refund_status: 'owed' }))).not.toContain('The payment did arrive')
    expect(labels(order({ status: 'cancelled', payment_status: 'received', refund_status: 'owed' }))).toContain('Mark as refunded')
    expect(labels(order({ status: 'cancelled', payment_status: 'awaiting' }))).not.toContain('The payment did arrive')
    expect(labels(order({ status: 'cancelled', payment_status: 'reported', total_pence: 0 }))).not.toContain('The payment did arrive')
  })
})

describe('the database’s side of it', () => {
  it('owes a refund for a payment marked paid or verified, and for no other', () => {
    expect(refunds).toMatch(/registration_money_confirmed[\s\S]*?o\.payment_status = 'received'\s+or \(o\.payment_status = 'reported' and o\.payment_verified_at is not null\)/)
  })

  it('asks that question wherever a refund becomes owed: both cancels and the event’s', () => {
    expect(refunds.match(/public\.registration_money_confirmed\(o\)/g)).toHaveLength(3)
    // "In, or said to be" is left to the one place that guards a record, and is not asked here.
    expect(refunds).not.toMatch(/when public\.registration_money_in\(o\)/)
  })

  it('lets a cancelled registration be marked paid only when its payment was reported, and owes the refund then', () => {
    expect(refunds).toContain("if o.status <> 'confirmed' and not (p_action = 'received' and o.payment_status = 'reported') then")
    expect(refunds).toMatch(/when p_action = 'received' and refund_status is null and total_pence > 0\s+and \(status = 'cancelled' or ev\.cancelled_at is not null\) then 'owed'/)
  })

  it('keeps each replaced function’s path, and closes the new question to callers', () => {
    expect(refunds.match(/SET search_path TO 'public'/g)).toHaveLength(4)
    expect(refunds.match(/SECURITY DEFINER/g)).toHaveLength(4)
    expect(refunds).toContain('revoke all on function public.registration_money_confirmed(public.registration_orders) from public, anon, authenticated;')
  })
})
