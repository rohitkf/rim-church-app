import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { MenuAction } from '../components/ActionMenu'
import { ApplyPromoDialog } from '../components/ApplyPromoDialog'
import { useConfirmAction } from '../components/ConfirmAction'
import { OrderEmailDialog } from '../components/OrderEmailDialog'
import { ActionButton, Field, Overlay, inputClasses } from '../components/Surface'
import { ACTION_DONE, orderActions } from './orderActions'
import { applyPromoToOrder, sendTicketAfterPromo, usablePromos } from './promoLater'
import { ticketUrl } from './registrationLinks'
import type { RegistrationRights } from './registrationRights'
import { offerUndo } from './registrationUndo'
import {
  markOrder,
  notifyPayment,
  sendTicketAgain,
  setOrderEmail,
  setOrderNotes,
  type OrderAction,
  type OrderRow,
  type PromoCode,
  type TicketType,
} from './registrations'
import { showToast } from './toast'
import { useErrorText } from './useErrorText'

/**
 * The rest of what Reception can do to a registration (0312): its "more"
 * menu, and the dialogs the menu opens.
 *
 * A door had three buttons — check in, mark as paid, walk-in — and
 * anything that did not fit them was the office's. The office is not at
 * the door. So whoever holds "Sort out problems" gets, on each
 * registration: correct the email address or send the ticket again, a
 * note, a promo code they were meant to use, waive the payment or put it
 * back to not paid, cancel it or put it back — and everybody at the door
 * gets "Open their ticket".
 *
 * The list is the office's own (`orderActions`), asked with the door's
 * rights, so the two pages cannot disagree about what a thing is called
 * or who may press it. Three of the office's answers are switched off
 * here whoever is asking — verifying a payment, "not received, ask
 * again" and refunds: they are done against the bank account, from the
 * event's page, and Reception links there for whoever may.
 *
 * Every press is one the Undo takes back (0281), and an email that
 * follows a press waits for that offer to pass, as on the event's page.
 */
export function useDoorTools({
  slug,
  eventCancelled,
  ticketTypes,
  promoCodes,
  rights,
  refresh,
  onError,
}: {
  /** The event's public link, for the ticket's email after a promo code goes on. */
  slug: string
  eventCancelled: boolean
  ticketTypes: TicketType[]
  /** The event's codes, as far as this person may read them: none, for somebody who may not put one on. */
  promoCodes: PromoCode[]
  rights: RegistrationRights
  refresh: () => Promise<void>
  /** What the database refused, in words, for the page's own alert; null clears it. */
  onError: (message: string | null) => void
}): { actionsFor: (order: OrderRow) => MenuAction[]; dialogs: ReactNode; busy: boolean } {
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [noteFor, setNoteFor] = useState<OrderRow | null>(null)
  const [noteText, setNoteText] = useState('')
  const [emailFor, setEmailFor] = useState<OrderRow | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [promoFor, setPromoFor] = useState<OrderRow | null>(null)
  const [promoError, setPromoError] = useState<string | null>(null)
  const codes = usablePromos(promoCodes)
  // The door's menu is the door's: what is done against the bank account is done from the event's page.
  const doorRights: RegistrationRights = { ...rights, approve: false, verify: false, refund: false }

  const done = (order: OrderRow, text: string, then?: () => void) => void offerUndo({ text, orderId: order.id, then, refresh, words: errorText })
  // "Your ticket is confirmed", to whoever gave an address, once the press can no longer be taken back.
  const ticketConfirmed = (order: OrderRow) => (order.email ? () => void notifyPayment('paid', order.code) : undefined)

  const mark = useMutation({
    mutationFn: ({ order, action }: { order: OrderRow; action: OrderAction }) => markOrder(order.id, action),
    onSuccess: (_r, { order, action }) => {
      onError(null)
      done(order, `${ACTION_DONE[action]}: ${order.name}`, action === 'received' ? ticketConfirmed(order) : undefined)
      return refresh()
    },
    onError: (err: unknown) => {
      onError(errorText(err, 'Could not change that registration.'))
      // Refused because it had changed under them: show it as it now is.
      void refresh()
    },
  })
  const saveNote = useMutation({
    mutationFn: ({ order, notes }: { order: OrderRow; notes: string }) => setOrderNotes(order.id, notes),
    onSuccess: (_r, { order }) => {
      onError(null)
      setNoteFor(null)
      done(order, `Note saved: ${order.name}`)
      return refresh()
    },
    onError: (err: unknown) => onError(errorText(err, 'Could not save the note.')),
  })
  // Their email, once more (0283): after an address is put right, or because the first never arrived.
  const emailAgain = (order: OrderRow) =>
    void sendTicketAgain(order.code).then((result) => {
      if (!result.ok) showToast(`The email to ${order.name} could not be sent. Try again from their menu in a few minutes.`, 'error', 6000)
      return refresh()
    })
  const changeEmail = useMutation({
    mutationFn: ({ order, email }: { order: OrderRow; email: string }) => setOrderEmail(order.id, email),
    onSuccess: (changed, { order, email }) => {
      onError(null)
      setEmailFor(null)
      const live = order.status === 'confirmed'
      if (changed) {
        // The email waits for the offer of an undo: an address typed with a slip never gets somebody's ticket.
        done(order, live ? `Email address changed — their email goes to ${email}` : 'Email address changed', live ? () => emailAgain(order) : undefined)
      } else if (live) {
        showToast(`Sending their email again to ${email}`)
        emailAgain(order)
      }
      return refresh()
    },
    onError: (err: unknown) => setEmailError(errorText(err, 'Could not change the address.')),
  })
  const applyPromo = useMutation({
    mutationFn: ({ order, code }: { order: OrderRow; code: PromoCode }) => applyPromoToOrder(order.id, code.code),
    onSuccess: (_r, { order, code }) => {
      setPromoFor(null)
      setPromoError(null)
      onError(null)
      // Their ticket as it now stands, by email, once the press can no longer be taken back.
      const mail = order.email
        ? () =>
            void sendTicketAfterPromo(order, slug).then((sent) => {
              if (!sent.ok || sent.sent === false) showToast(`${order.name} was not emailed about this. Tell them, or send their email again in a few minutes.`, 'error', 8000)
            })
        : undefined
      done(order, `Promo code ${code.code} applied: ${order.name}`, mail)
      return refresh()
    },
    onError: (err: unknown) => {
      setPromoError(errorText(err, 'The code could not be put on that registration.'))
      void refresh()
    },
  })

  const cancelOrder = (order: OrderRow) =>
    ask({
      title: `Cancel ${order.name}’s registration?`,
      body: `Their ${order.quantity === 1 ? 'ticket goes' : `${order.quantity} tickets go`} back on sale. If they have paid, the office is told a refund is owed.`,
      confirmLabel: 'Cancel it',
      cancelLabel: 'Keep it',
      onConfirm: () => mark.mutate({ order, action: 'cancel' }),
    })
  const nothing = () => undefined

  const actionsFor = (order: OrderRow): MenuAction[] => [
    ...orderActions(
      order,
      (action) => mark.mutate({ order, action }),
      () => {
        setNoteText(order.notes ?? '')
        setNoteFor(order)
      },
      () => cancelOrder(order),
      nothing,
      eventCancelled,
      nothing,
      doorRights,
      nothing,
      () => {
        setEmailError(null)
        setEmailFor(order)
      },
      codes.length > 0
        ? () => {
            setPromoError(null)
            setPromoFor(order)
          }
        : undefined,
    ),
    // The page they were sent, as they see it: to read it out, or to send it to themselves from there.
    { label: 'Open their ticket', onSelect: () => void window.open(ticketUrl(order.code), '_blank', 'noopener,noreferrer'), hint: order.status === 'confirmed' ? 'What they see, with its QR code' : 'What they see' },
  ]

  const dialogs = (
    <>
      {emailFor && (
        <OrderEmailDialog order={emailFor} busy={changeEmail.isPending} error={emailError} onSave={(email) => changeEmail.mutate({ order: emailFor, email })} onClose={() => setEmailFor(null)} />
      )}
      {promoFor && (
        <ApplyPromoDialog
          order={promoFor}
          ticketTypes={ticketTypes}
          codes={codes}
          busy={applyPromo.isPending}
          error={promoError}
          onApply={(code) => applyPromo.mutate({ order: promoFor, code })}
          onClose={() => setPromoFor(null)}
        />
      )}
      {noteFor && (
        <Overlay label={`A note on ${noteFor.name}’s registration`} onDismiss={() => setNoteFor(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveNote.mutate({ order: noteFor, notes: noteText })
            }}
            className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]"
          >
            <h2 className="text-headline-md text-on-surface">A note on {noteFor.name}’s registration</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">For whoever works Reception or runs registrations; the attendee never sees it.</p>
            <Field label="Note" className="mt-4">
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} maxLength={2000} autoFocus className={`${inputClasses} resize-y`} />
            </Field>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <ActionButton tone="ghost" onClick={() => setNoteFor(null)}>
                Cancel
              </ActionButton>
              <ActionButton type="submit" disabled={saveNote.isPending}>
                Save note
              </ActionButton>
            </div>
          </form>
        </Overlay>
      )}
      {dialog}
    </>
  )

  return { actionsFor, dialogs, busy: mark.isPending || saveNote.isPending || changeEmail.isPending || applyPromo.isPending }
}
