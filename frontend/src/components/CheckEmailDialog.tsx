import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import { deviceFrom, planFor } from '../lib/mailApp'
import { Overlay } from './Surface'
import { authSubmitClasses } from './AuthCard'

/**
 * "We've sent you an email", said where it cannot be missed.
 *
 * People kept signing up and never confirming, and when asked it was
 * always the same: the email had arrived — in spam. So after sign-up this
 * says which address it went to (a typo is the other reason), says plainly
 * to look in spam, and puts a button where the next step is: Open email.
 * On Android that is the system's own chooser of installed mail apps; see
 * lib/mailApp for each kind of device.
 *
 * Resend is here because "I still can't see it" is the next thing anybody
 * says, and the answer should not be to sign up all over again. It waits
 * a minute between sends: the email service has its own limit, and a
 * button that can be pressed ten times produces ten emails and none of
 * them any faster.
 */

const RESEND_WAIT_SECONDS = 60

export function CheckEmailDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const plan = planFor(email, deviceFrom(navigator))
  const [wait, setWait] = useState(RESEND_WAIT_SECONDS)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // The one that just went out counts: the wait starts when the dialog opens.
  useEffect(() => {
    if (wait <= 0) return
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(id)
  }, [wait])

  async function resend() {
    setSending(true)
    setNote(null)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email })
      if (error) {
        setNote({ tone: 'error', text: error.message })
        return
      }
      setNote({ tone: 'ok', text: 'Sent again. Give it a minute, and check spam.' })
      setWait(RESEND_WAIT_SECONDS)
    } catch (err: unknown) {
      setNote({ tone: 'error', text: errorMessage(err, "Couldn't reach the server. Try again in a moment.") })
    } finally {
      setSending(false)
    }
  }

  return (
    <Overlay onDismiss={onClose} label="Check your email">
      <div className="w-full max-w-[400px] rounded-[var(--radius-shell)] bg-surface-lowest p-7 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:p-8 dark:ring-white/12">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_22%,transparent)] text-accent-blue-soft"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m4 7.5 8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>

        <h2 className="mt-5 text-headline-md">Check your email</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          We&rsquo;ve sent a confirmation email to
        </p>
        <p className="mt-1 break-all rounded-[var(--radius-chip)] bg-surface-container px-3 py-2 font-mono text-body-sm text-on-surface">
          {email}
        </p>
        <p className="mt-3 text-body-sm text-on-surface-variant">
          Open it and tap the link to finish. Then come back and sign in.
        </p>

        <p className="mt-4 rounded-[var(--radius-chip)] bg-[color-mix(in_oklab,var(--color-accent-orange)_14%,transparent)] px-3.5 py-3 text-body-sm text-on-surface">
          <strong className="font-medium">Can&rsquo;t see it?</strong> Check your <strong className="font-medium">spam or junk</strong> folder
          too. It can take a minute or two to arrive.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {plan.open && (
            <a
              href={plan.open.href}
              target={plan.open.newTab ? '_blank' : undefined}
              rel={plan.open.newTab ? 'noopener noreferrer' : undefined}
              autoFocus
              className={`${authSubmitClasses} text-center no-underline`}
            >
              Open email
            </a>
          )}
          {plan.web && (
            <a
              href={plan.web.href}
              target="_blank"
              rel="noopener noreferrer"
              className="tap text-center text-label-md text-secondary hover:underline"
            >
              Open {plan.web.provider} in the browser
            </a>
          )}

          <button
            type="button"
            onClick={() => void resend()}
            disabled={sending || wait > 0}
            className="tap rounded-full px-4 py-2.5 text-label-md text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-60"
          >
            {sending ? 'Sending…' : wait > 0 ? `Send it again (${wait}s)` : 'Send it again'}
          </button>
          {note && (
            <p
              role={note.tone === 'error' ? 'alert' : 'status'}
              className={`text-center text-body-sm ${note.tone === 'error' ? 'text-error' : 'text-success'}`}
            >
              {note.text}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="tap text-center text-label-md text-on-surface-faint hover:text-on-surface"
          >
            Wrong address? Go back
          </button>
        </div>
      </div>
    </Overlay>
  )
}
