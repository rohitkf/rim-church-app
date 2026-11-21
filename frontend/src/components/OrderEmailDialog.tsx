import { useState } from 'react'
import { ActionButton, Field, Overlay, Pill, inputClasses } from './Surface'
import { deliveryOf, looksLikeEmail, suggestEmail } from '../lib/emailDelivery'
import type { OrderRow } from '../lib/registrations'

/**
 * A registration's email address, for the church to put right (0283).
 *
 * It says what became of the last email — the reason a bounce gave, in
 * the mail server's own words — and takes the right address. Saving a new
 * one sends their email to it, once the offer of an undo has passed; the
 * same address again just sends the email once more, for a mailbox that
 * was full or an email that was never found.
 *
 * It does not save anything itself: the page does, so the change is one
 * more thing its Undo takes back.
 */

const stamp = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function OrderEmailDialog({
  order,
  busy,
  error,
  onSave,
  onClose,
}: {
  order: OrderRow
  busy: boolean
  /** The database's refusal, in words, if the last try was refused. */
  error: string | null
  onSave: (email: string) => void
  onClose: () => void
}) {
  const [email, setEmail] = useState(order.email ?? '')
  const typed = email.trim()
  const delivery = deliveryOf(order)
  const same = !!order.email && typed.toLowerCase() === order.email.toLowerCase()
  const meant = suggestEmail(typed)
  const live = order.status === 'confirmed'
  const changer = [order.changer?.first_name, order.changer?.last_name].filter(Boolean).join(' ')
  const was = order.email_before?.email
  const title = `${order.name}’s email address`

  return (
    <Overlay label={title} onDismiss={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (looksLikeEmail(typed) && !busy) onSave(typed)
        }}
        className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]"
      >
        <h2 className="text-headline-md text-on-surface [overflow-wrap:anywhere]">{title}</h2>

        {delivery && (
          <div className="mt-3 rounded-[var(--radius-chip)] bg-surface-container px-3 py-2.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-on-surface">
              <Pill tone={delivery.tone}>{delivery.label}</Pill>
              {order.email_status_at && <span className="text-on-surface-faint">{stamp(order.email_status_at)}</span>}
            </p>
            <p className="mt-1.5 text-body-sm text-on-surface-variant">{delivery.says}</p>
            {delivery.wants && order.email_status_detail && (
              <p className="mt-1.5 text-label-md text-on-surface-faint [overflow-wrap:anywhere]">
                {delivery.kind === 'failed' ? 'The email service said' : 'The mail server said'}: “{order.email_status_detail}”
              </p>
            )}
          </div>
        )}
        {order.email_changed_at && (
          <p className="mt-2 text-label-md text-on-surface-faint [overflow-wrap:anywhere]">
            Changed {stamp(order.email_changed_at)} by {changer || 'the attendee, from their ticket page'}
            {was ? ` — it was ${was}` : ''}.
          </p>
        )}

        <Field label="Email address" className="mt-4">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
            autoFocus
            className={inputClasses}
          />
        </Field>
        {meant && (
          <p className="mt-2 text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">
            Did you mean{' '}
            <button type="button" onClick={() => setEmail(meant)} className="tap font-medium text-accent-blue-soft hover:underline">
              {meant}
            </button>
            ?
          </p>
        )}
        <p className="mt-2 text-label-md text-on-surface-faint">
          {!live
            ? 'This registration is cancelled, so nothing is emailed now. The address is kept for anything still to send.'
            : same
              ? 'Their email goes to this address again, as the registration stands now.'
              : 'Their email — the registration as it stands, with its link — goes to the new address ten seconds after you save, so a slip can be undone first.'}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <ActionButton tone="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton type="submit" disabled={busy || !looksLikeEmail(typed) || (same && !live)}>
            {busy ? 'Saving…' : same ? 'Send it again' : live ? 'Save and send' : 'Save'}
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}
