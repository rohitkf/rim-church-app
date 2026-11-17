import { type FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ActionButton, Field, inputClasses } from './Surface'
import { applyPromoToTicket } from '../lib/promoLater'
import { useErrorText } from '../lib/useErrorText'

/**
 * "Have a promo code?" on a registration that is still to be paid (0298).
 *
 * Somebody who was given a code and registered without it used to
 * register a second time to use it, leaving the first as a payment the
 * church went on expecting. Here they put the code on the registration
 * they already have: the price comes down, or the registration becomes
 * their ticket.
 *
 * Folded until asked for — most people have no code, and the box is in
 * the way of how to pay. Pressed empty, it says so. What the database
 * refuses (not a code, used up, nothing off these tickets) is said in its
 * own words under the box.
 */
export function TicketPromoCode({ ticketCode, onApplied }: { ticketCode: string; onApplied: () => void }) {
  const errorText = useErrorText()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [missing, setMissing] = useState(false)
  const apply = useMutation({
    mutationFn: () => applyPromoToTicket(ticketCode, text.trim()),
    onSuccess: onApplied,
  })
  const problem = missing ? 'Enter your promo code.' : apply.error ? errorText(apply.error, 'That code could not be applied. Check it and try again.') : null

  if (!open) {
    return (
      <p className="mt-3 text-body-sm text-on-surface-variant">
        Have a promo code?{' '}
        <button type="button" onClick={() => setOpen(true)} className="tap font-medium text-accent-blue-soft hover:underline">
          Use it on this registration
        </button>
      </p>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) {
      setMissing(true)
      return
    }
    setMissing(false)
    apply.mutate()
  }

  return (
    <form onSubmit={submit} aria-label="Use a promo code" className="mt-3 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Promo code" className="min-w-0 flex-1">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value.toUpperCase())
              setMissing(false)
              apply.reset()
            }}
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            maxLength={30}
            autoFocus
            className={`${inputClasses} ${problem ? 'field-error' : ''}`}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'ticket-promo-error' : undefined}
          />
        </Field>
        <ActionButton type="submit" tone="quiet" disabled={apply.isPending}>
          {apply.isPending ? 'Applying…' : 'Apply'}
        </ActionButton>
      </div>
      {/* Outside the label: words inside it would become part of the field's name. */}
      {problem ? (
        <p id="ticket-promo-error" role="alert" className="text-body-sm font-medium text-error">
          {problem}
        </p>
      ) : (
        <p className="text-label-md text-on-surface-variant">It comes off this registration. You do not need to register again.</p>
      )}
    </form>
  )
}
