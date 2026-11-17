import { supabase } from './supabaseClient'
import { discountOn, resendTickets, sendTicketAgain, type OrderRow, type PromoCode, type TicketMailResult, type TicketType } from './registrations'

/*
 * A promo code put on a registration that is already made (0298).
 *
 * People who were meant to use a code registered without it, were asked
 * for the money, and registered again with the code — two registrations
 * for one person, one of them a payment that would never come. Now the
 * first registration can simply be given the code: by the church, from
 * its ⋯ menu, or by the attendee, from their own ticket page.
 *
 * The database does it and decides whether it may (registration_apply_promo);
 * what is here is the two calls, which registrations and codes the office
 * is offered, and what a code would come to — the same sum as registering
 * with it, so the price said before the press is the price after it.
 */

/** The church, for somebody: the right to approve payments. */
export async function applyPromoToOrder(orderId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc('registration_order_apply_promo', { p_id: orderId, p_code: code })
  if (error) throw error
}

/** The attendee, from their own ticket page: they hold the ticket's code. */
export async function applyPromoToTicket(ticketCode: string, promo: string): Promise<void> {
  const { error } = await supabase.rpc('registration_order_promo', { p_code: ticketCode, p_promo: promo })
  if (error) throw error
}

/**
 * Their registration as it now stands, by email, after the church put a
 * code on it — so somebody who was asked for money learns they now hold a
 * ticket, or owe less.
 *
 * The email that fits is "your ticket once more" (`again`), but that is
 * the right to correct addresses (reg.email), and whoever applies a code
 * needs only the right to approve payments. Refused that, it asks for the
 * address's tickets the way the public page does (`resend`), which needs
 * no right at all and only ever writes to the address an order is under —
 * so the attendee is told whoever pressed. Nothing waits on either: the
 * registration's own page already shows the new price.
 */
export async function sendTicketAfterPromo(order: Pick<OrderRow, 'code' | 'email'>, slug: string): Promise<TicketMailResult> {
  if (!order.email) return { ok: true, sent: false }
  const again = await sendTicketAgain(order.code)
  if (again.ok) return again
  return resendTickets(slug, order.email).catch(() => ({ ok: false, reason: 'failed' }))
}

/**
 * Whether a registration can take a code: live, still awaiting its
 * payment, and with no code, invitation or discount on it. One with a
 * payment recorded (reported, received, waived) is put back to awaiting
 * first — that is a decision, not a side effect.
 */
export function canTakePromo(o: Pick<OrderRow, 'status' | 'payment_status' | 'total_pence' | 'discount_pence' | 'promo_code' | 'invite_id'>): boolean {
  return o.status === 'confirmed' && o.payment_status === 'awaiting' && o.total_pence > 0 && o.discount_pence === 0 && !o.promo_code && !o.invite_id
}

/** The event's codes that could still be used: turned on, with a use left. */
export function usablePromos(codes: readonly PromoCode[]): PromoCode[] {
  return codes.filter((p) => p.active && (p.max_uses === null || p.uses < p.max_uses))
}

/**
 * What a code would come to on this registration: the tickets it is for,
 * at the price each was registered at. `discount` 0 is a code that takes
 * nothing off these tickets, which the database refuses rather than spends.
 */
export function promoWorth(
  order: Pick<OrderRow, 'tickets' | 'subtotal_pence'>,
  types: readonly Pick<TicketType, 'id' | 'kind'>[],
  code: Pick<PromoCode, 'kind' | 'value' | 'ticket_type_ids' | 'tickets_covered'>,
): { discount: number; total: number } {
  const paid = new Set(types.filter((t) => t.kind === 'paid').map((t) => t.id))
  const prices = order.tickets
    .filter((t) => paid.has(t.ticket_type_id) && (code.ticket_type_ids.length === 0 || code.ticket_type_ids.includes(t.ticket_type_id)))
    .map((t) => t.unit_price_pence)
  const discount = discountOn(prices, { kind: code.kind, value: code.value, tickets_covered: code.tickets_covered ?? null })
  return { discount, total: order.subtotal_pence - discount }
}

/** What a code gives, in a few words, for the office's list: "100% off, one ticket", "£5.00 off". */
export function promoWords(code: Pick<PromoCode, 'kind' | 'value' | 'tickets_covered'>, pounds: (pence: number) => string): string {
  const what = code.kind === 'percent' ? `${code.value}% off` : `${pounds(code.value)} off`
  if (!code.tickets_covered) return what
  return `${what}, ${code.tickets_covered === 1 ? 'one ticket' : `up to ${code.tickets_covered} tickets`}`
}
