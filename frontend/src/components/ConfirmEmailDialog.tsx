import { useEffect, useState } from 'react'
import { ActionButton, Overlay } from './Surface'
import { confirmEmailWaitSeconds, suggestEmail } from '../lib/emailDelivery'

/**
 * "Is this your email address?" — asked once, between pressing Register
 * and registering (0283).
 *
 * A ticket goes to the address typed, and an address typed with a slip
 * takes it nowhere: the email bounces, or worse, reaches a stranger. A
 * form field is read as it is typed and not again; this shows the address
 * on its own, large, with nothing else to look at, and asks. Where the
 * part after the @ is a well-known provider spelt nearly right
 * (gmial.com), it offers the right spelling.
 *
 * "No" goes back to the form with everything as it was. Nothing is saved
 * until "Yes".
 *
 * "Yes" cannot be pressed for the first five seconds: it counts down
 * instead, so the address is looked at rather than tapped past
 * (lib/emailDelivery, CONFIRM_EMAIL_WAIT_SECONDS). Taking the spelling
 * offered shows a different address, so the count starts again for it.
 */
export function ConfirmEmailDialog({
  email,
  confirmLabel,
  busy,
  onConfirm,
  onChange,
  onUse,
}: {
  email: string
  /** The form's own word for going ahead: "Register", "Register, then pay £10". */
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  /** Back to the form, to type it again. */
  onChange: () => void
  /** Take the spelling offered instead; the dialog stays, showing it. */
  onUse: (email: string) => void
}) {
  const meant = suggestEmail(email)
  return (
    <Overlay label="Is this your email address?" onDismiss={onChange}>
      <div className="w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h2 className="text-headline-md text-on-surface">Is this your email address?</h2>
        <p className="mt-3 break-all rounded-[var(--radius-chip)] bg-surface-container px-3.5 py-3 text-center font-mono text-body-lg font-medium text-on-surface" data-testid="email-to-confirm">
          {email}
        </p>
        <p className="mt-3 text-body-sm text-on-surface-variant">Your ticket is sent here, and nowhere else. Check each letter: one slip and it never arrives.</p>
        {meant && (
          <div className="mt-3 rounded-[var(--radius-chip)] bg-[color-mix(in_oklab,var(--color-accent-orange)_14%,transparent)] px-3.5 py-3 text-body-sm text-on-surface">
            <p>
              Did you mean <strong className="break-all font-semibold">{meant}</strong>?
            </p>
            <button type="button" onClick={() => onUse(meant)} className="tap mt-1 font-medium text-accent-blue-soft hover:underline">
              Yes, use that one
            </button>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-2">
          {/* Keyed by the address: a different one is a new thing to read, and a new count. */}
          <ConfirmButton key={email} label={`Yes, it’s right — ${confirmLabel}`} busy={busy} onConfirm={onConfirm} />
          <ActionButton tone="quiet" onClick={onChange} disabled={busy}>
            No, change it
          </ActionButton>
        </div>
      </div>
    </Overlay>
  )
}

/** "Yes", once the address has had its seconds: until then it counts down and cannot be pressed. */
function ConfirmButton({ label, busy, onConfirm }: { label: string; busy: boolean; onConfirm: () => void }) {
  const [left, setLeft] = useState(confirmEmailWaitSeconds)
  const waiting = left > 0
  useEffect(() => {
    if (!waiting) return
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(tick)
  }, [waiting])
  return (
    <ActionButton onClick={onConfirm} disabled={busy || waiting}>
      {busy ? (
        'Registering…'
      ) : waiting ? (
        <>
          Check the address… <span className="tabular-nums">{left}</span>
        </>
      ) : (
        label
      )}
    </ActionButton>
  )
}
