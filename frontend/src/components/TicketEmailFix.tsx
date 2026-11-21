import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ActionButton, Field, inputClasses } from './Surface'
import { looksLikeEmail, suggestEmail } from '../lib/emailDelivery'
import { fixOrderEmail, sendTicketEmail, type OrderView } from '../lib/registrations'
import { useErrorText } from '../lib/useErrorText'

/**
 * "We could not email you", on the ticket page (0283).
 *
 * The email to the address on the order came back. The attendee who has
 * just registered is still on this page, and it is the one place they can
 * be told — so it says which address, asks for the right one, and sends
 * the ticket there. The database takes a correction only after a bounce
 * and three times at most (registration_order_fix_email); past that, or
 * for a registration it will not let the page change, it says to contact
 * the church.
 */
export function TicketEmailFix({ order, noun, onFixed }: { order: OrderView; noun: string; onFixed: (email: string) => void }) {
  const errorText = useErrorText()
  // The address as they typed it: the slip is usually one letter, and easier to mend than to type again.
  const [email, setEmail] = useState(order.email ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const typed = email.trim()
  const same = typed.toLowerCase() === (order.email ?? '').toLowerCase()
  const meant = suggestEmail(typed)
  const fix = useMutation({
    mutationFn: async () => {
      await fixOrderEmail(order.code, typed)
      // The address is theirs now; the ticket follows it. Nothing waits on the email.
      void sendTicketEmail(order.code)
    },
    onSuccess: () => {
      setProblem(null)
      onFixed(typed.toLowerCase())
    },
    onError: (err: unknown) => setProblem(errorText(err, 'Could not change the address. Try again.')),
  })

  return (
    <section
      aria-label="Your email address"
      className="mt-4 rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-accent-red)_10%,var(--color-surface-lowest))] p-5 shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--color-accent-red)_50%,transparent)]"
    >
      <h2 className="text-headline-md text-on-surface">We could not email you</h2>
      <p className="mt-1 text-body-md text-on-surface">
        The email to <strong className="break-all font-semibold">{order.email}</strong> came back, so your {noun} has not reached your inbox.
      </p>
      {order.email_can_fix ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (looksLikeEmail(typed) && !same && !fix.isPending) fix.mutate()
          }}
          className="mt-3 flex flex-col gap-2"
        >
          <p className="text-body-sm text-on-surface-variant">Check it for a slip and put it right. Your {noun} will be sent to the address you give.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Your email address" className="min-w-0 flex-1 basis-56">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={254}
                className={inputClasses}
              />
            </Field>
            <ActionButton type="submit" disabled={fix.isPending || !looksLikeEmail(typed) || same}>
              {fix.isPending ? 'Sending…' : `Send my ${noun}`}
            </ActionButton>
          </div>
          {meant && (
            <p className="text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">
              Did you mean{' '}
              <button type="button" onClick={() => setEmail(meant)} className="tap font-medium text-accent-blue-soft hover:underline">
                {meant}
              </button>
              ?
            </p>
          )}
          {problem && (
            <p role="alert" className="text-body-sm text-error">
              {problem}
            </p>
          )}
        </form>
      ) : (
        <p className="mt-2 text-body-sm text-on-surface-variant">Please contact the church to put your email address right.</p>
      )}
      <p className="mt-3 text-label-md text-on-surface-variant">This page is your {noun} either way — keep its link, or take a screenshot.</p>
    </section>
  )
}
