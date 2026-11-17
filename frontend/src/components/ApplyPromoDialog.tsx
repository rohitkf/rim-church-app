import { type FormEvent, useState } from 'react'
import { ActionButton, Overlay } from './Surface'
import { pounds } from '../lib/money'
import type { OrderRow, PromoCode, TicketType } from '../lib/registrations'
import { promoWords, promoWorth } from '../lib/promoLater'

/**
 * Putting a promo code on somebody's registration for them (0298).
 *
 * For the person who was meant to use a code and registered without it:
 * the church gives their registration the code, rather than them
 * registering a second time. The event's usable codes are listed — the
 * office does not type one — each with what the registration would come
 * to, worked out as the database will work it out; a code that would
 * take nothing off these tickets is shown and cannot be chosen, with the
 * reason, because the database would refuse it.
 *
 * Pressed with nothing chosen, it says so rather than doing nothing.
 */
export function ApplyPromoDialog({
  order,
  ticketTypes,
  codes,
  busy,
  error,
  onApply,
  onClose,
}: {
  order: OrderRow
  ticketTypes: TicketType[]
  /** The event's codes that could still be used (lib/promoLater's usablePromos). */
  codes: PromoCode[]
  busy: boolean
  error: string | null
  onApply: (code: PromoCode) => void
  onClose: () => void
}) {
  const worth = (code: PromoCode) => promoWorth(order, ticketTypes, code)
  const useful = codes.filter((c) => worth(c).discount > 0)
  // One code that does something: it is the answer, already chosen.
  const [chosen, setChosen] = useState<string | null>(useful.length === 1 ? useful[0].id : null)
  const [tried, setTried] = useState(false)
  const picked = codes.find((c) => c.id === chosen) ?? null
  const title = `A promo code for ${order.name}’s registration`

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!picked) {
      setTried(true)
      return
    }
    onApply(picked)
  }

  return (
    <Overlay label={title} onDismiss={onClose}>
      <form onSubmit={submit} aria-label={title} className="flex max-h-[90dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)]">
        <div>
          <h2 className="text-headline-md text-on-surface">{title}</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            They registered without one and owe {pounds(order.total_pence)}. Putting the code on this registration saves them registering again.
          </p>
        </div>

        {codes.length === 0 ? (
          <p className="text-body-md text-on-surface">This event has no promo code that can be used: none is turned on, or each has run out of uses. Add or turn one on under Edit.</p>
        ) : (
          <div role="radiogroup" aria-label="Which code" className="flex flex-col gap-2" aria-describedby={tried && !picked ? 'apply-promo-error' : undefined}>
            {codes.map((c) => {
              const { discount, total } = worth(c)
              const nothing = discount <= 0
              return (
                <label
                  key={c.id}
                  className={`flex items-start gap-3 rounded-[var(--radius-row)] p-3 hairline ${nothing ? 'opacity-60' : 'cursor-pointer'} ${chosen === c.id ? 'bg-raised' : ''}`}
                >
                  <input type="radio" name="promo" checked={chosen === c.id} disabled={nothing} onChange={() => setChosen(c.id)} className="mt-1 accent-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-body-md font-semibold text-on-surface [overflow-wrap:anywhere]">{c.code}</span>
                    <span className="block text-body-sm text-on-surface-variant">{promoWords(c, pounds)}</span>
                    <span className={`mt-0.5 block text-body-sm ${nothing ? 'text-on-surface-faint' : 'font-medium text-accent-green-soft'}`}>
                      {nothing ? 'Takes nothing off the tickets on this registration.' : total > 0 ? `${pounds(discount)} off: ${pounds(total)} left to pay.` : `${pounds(discount)} off: nothing left to pay.`}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        )}

        {tried && !picked && codes.length > 0 && (
          <p id="apply-promo-error" role="alert" className="text-body-sm font-medium text-error">
            {useful.length === 0 ? 'None of these codes takes anything off this registration.' : 'Choose which code to put on.'}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton tone="ghost" onClick={onClose}>
            {codes.length === 0 ? 'Close' : 'Cancel'}
          </ActionButton>
          {codes.length > 0 && (
            <ActionButton type="submit" disabled={busy}>
              {busy ? 'Applying…' : picked ? `Apply ${picked.code}` : 'Apply the code'}
            </ActionButton>
          )}
        </div>
      </form>
    </Overlay>
  )
}
