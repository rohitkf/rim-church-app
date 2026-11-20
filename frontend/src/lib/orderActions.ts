import type { MenuAction } from '../components/ActionMenu'
import { emailWantsDoing } from './emailDelivery'
import { pounds } from './money'
import { canTakePromo, carriesPromo, promoHeldBy } from './promoLater'
import type { RegistrationRights } from './registrationRights'
import { canBeVerified, type OrderAction, type OrderRow } from './registrations'

/*
 * A registration's menu: what can be done to it, and what each thing is
 * called once done. It lived in the event's page until Reception needed
 * the same list (0312) — one list, so the two pages cannot come to
 * disagree about what "Waive the payment" is called or who may press it.
 */

export const ACTION_DONE: Record<OrderAction, string> = {
  received: 'Marked as paid',
  waived: 'Payment waived',
  awaiting: 'Back to not paid',
  check_in: 'Checked in',
  undo_check_in: 'Check-in undone',
  cancel: 'Registration cancelled',
  restore: 'Registration put back',
  refunded: 'Marked as refunded',
}

/**
 * The registration's menu, with the last thing this browser did to it at
 * the top for as long as the database will take it back (0281): the toast
 * that offered Undo is gone in seconds, and a slip is often noticed after.
 */
export function withUndo(last: string | null, undo: () => void, actions: MenuAction[]): MenuAction[] {
  if (!last) return actions
  return [{ label: 'Undo', tone: 'accent', onSelect: undo, hint: `“${last}” — puts it back exactly as it was` }, ...actions]
}

/**
 * What can be done to a registration, as it stands, by whoever is asking:
 * the one list both pages draw their menus from — the event's page in
 * Registrations, and Reception (0312), where the door's "Sort out
 * problems" answers to `email`, `note`, `promo`, `waive` and
 * `cancelOrder` and to nothing else here.
 */
export function orderActions(
  o: OrderRow,
  act: (action: OrderAction) => void,
  note: () => void,
  cancel: () => void,
  notReceived: () => void,
  eventCancelled: boolean,
  refundDetails: () => void,
  r: RegistrationRights,
  verify: (verified: boolean) => void,
  email: () => void,
  /** Put a promo code on it for them (0298); absent when the event has no code that could be used. */
  promo?: () => void,
  /** Take the promo code on it off again (0299). */
  removePromo?: () => void,
): MenuAction[] {
  const actions: MenuAction[] = []
  // Their address (0283): put right, or their email sent once more. Not once the retention job has blanked it.
  const emailAction: MenuAction[] =
    r.email && !o.anonymised_at
      ? [
          {
            label: o.email ? 'Change email address' : 'Add an email address',
            onSelect: email,
            tone: emailWantsDoing(o) ? 'accent' : 'plain',
            hint: emailWantsDoing(o) ? 'Their email did not arrive: put the address right, or send it again' : o.email ? 'Or send their email again' : 'Their ticket is emailed to it',
          },
        ]
      : []
  // The note is the office's, and the door's when it sorts out problems; somebody here only to check in has none to write.
  const noteAction: MenuAction[] = r.note ? [{ label: o.notes ? 'Edit the note' : 'Add a note', onSelect: note }] : []
  // A refund owed comes first: it is what this order needs.
  if (o.refund_status === 'owed' && r.refund) {
    actions.push({ label: 'Where to send the refund', onSelect: refundDetails, hint: refundWhere(o) })
    actions.push({ label: 'Mark as refunded', tone: 'accent', onSelect: () => act('refunded'), hint: refundHow(o) })
  }
  if (eventCancelled) {
    actions.push(...emailAction, ...noteAction)
    return actions
  }
  if (o.status === 'confirmed') {
    // Verifying (0267): the Pastor's and the Owner's, apart from the office's "received".
    if (r.verify && canBeVerified(o)) {
      actions.push(
        o.payment_verified_at
          ? { label: 'Take back the verification', onSelect: () => verify(false), hint: 'It was verified by mistake' }
          : { label: 'Verify payment', tone: 'accent', onSelect: () => verify(true), hint: 'You have seen it in the bank account or PayPal' },
      )
    }
    if (o.payment_status !== 'not_needed') {
      if (o.payment_status !== 'received' && r.takePayment) {
        actions.push({
          label: 'Mark as paid',
          onSelect: () => act('received'),
          tone: 'accent',
          hint: o.payment_status === 'reported' ? 'The receipt matches the account; their ticket is confirmed by email' : 'They have paid; their ticket is confirmed by email',
        })
      }
      // Registered without the code they were meant to use (0298): give this registration the code, rather than a second one.
      if (r.promo && promo && canTakePromo(o)) actions.push({ label: 'Apply a promo code', onSelect: promo, hint: 'They were meant to use one: the price comes down on this registration' })
      // Matching a receipt against the account is the office's: the door cannot see the account.
      if (r.approve && o.payment_status === 'reported') actions.push({ label: 'Not received, ask again', onSelect: notReceived, hint: 'Nothing matches; an email asks them to check' })
      if (r.waive) {
        if (o.payment_status !== 'waived') actions.push({ label: 'Waive the payment', onSelect: () => act('waived') })
        if (o.payment_status === 'received' || o.payment_status === 'waived') actions.push({ label: 'Back to not paid', onSelect: () => act('awaiting'), hint: 'It was marked paid or waived by mistake' })
      }
    }
    if (r.checkIn) {
      actions.push(
        o.checked_in_at
          ? { label: 'Undo check-in', onSelect: () => act('undo_check_in') }
          : // Not while it owes (0266): the database refuses it, so say why here.
            o.total_pence > 0 && (o.payment_status === 'awaiting' || o.payment_status === 'reported')
            ? { label: 'Check in', onSelect: () => undefined, disabled: true, hint: 'Not until it is paid: mark it paid or waive it first' }
            : { label: 'Check in', onSelect: () => act('check_in'), hint: 'They have arrived' },
      )
    }
    // A code on it that should not be (0299): off it comes, and the price is as it was.
    // What stands in the way is said rather than hidden: the database refuses the same.
    if (r.approve && removePromo && carriesPromo(o)) {
      const held = promoHeldBy(o)
      actions.push(
        held
          ? { label: 'Remove promo code', onSelect: () => undefined, disabled: true, hint: held }
          : { label: 'Remove promo code', onSelect: removePromo, hint: o.discount_pence > 0 ? `It goes back to ${pounds(o.subtotal_pence)}, not paid yet` : 'It took nothing off: the code just has its use back' },
      )
    }
  } else if (o.refund_status !== 'refunded' && r.cancelOrder) {
    actions.push({ label: 'Put back', onSelect: () => act('restore'), hint: 'If its tickets still fit' })
  }
  actions.push(...emailAction, ...noteAction)
  if (o.status === 'confirmed' && r.cancelOrder) actions.push({ label: 'Cancel registration', onSelect: cancel, tone: 'danger' })
  return actions
}

export const paidCash = (o: OrderRow) => !o.payment_method || o.payment_method === 'reception'
/** Where a refund goes, for the menu and the sheet. */
export function refundWhere(o: OrderRow): string {
  if (o.refund_details) return 'They sent bank details to use'
  if (paidCash(o)) return 'Paid at reception: waiting for their bank details'
  return o.payment_method === 'paypal' ? 'Paid through PayPal: refund it there' : 'Paid by bank transfer: back to the account it came from'
}
export function refundHow(o: OrderRow): string {
  if (o.refund_details) return 'Sent to the account they gave'
  if (paidCash(o)) return 'Sent to the account they gave'
  return o.payment_method === 'paypal' ? 'Refunded in PayPal' : 'Sent back to the account it came from'
}
