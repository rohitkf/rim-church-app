import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { IconBadge, inputClasses } from '../components/Surface'
import { LockIcon } from '../components/icons'
import { usePageTitle } from '../lib/pageTitle'
import { reloadApp } from '../lib/reloadApp'
import { codeDigits, codeErrorWords, giveCode, isWholeCode } from '../lib/secondStep'

/**
 * The second step of signing in: the code from an authenticator app.
 *
 * Shown in place of the whole app to somebody whose account has an
 * authenticator set up and whose session has only given the password
 * (0334, lib/secondStep). The database is turning away every request
 * until the code is given, so nothing behind this page would load; it is
 * the one thing to do.
 *
 * On the right code the app starts again from a clean page: everything it
 * read while it was half signed in was refused, and reading it all again
 * piece by piece would be guesswork (lib/reloadApp).
 *
 * There is no "use another way" here on purpose. Somebody who has lost
 * the phone asks the church's Owner, who can clear the authenticator from
 * Settings › Your account; a way round built into this page would be a
 * way round for whoever has the password too.
 */
export function SecondStepPage({ factorId, email }: { factorId: string; email: string | null }) {
  usePageTitle('Enter your code')
  const { signOut } = useAuth()
  const [typed, setTyped] = useState('')
  const [checking, setChecking] = useState(false)
  const [wrong, setWrong] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  async function submit(code: string) {
    if (checking || !isWholeCode(code)) return
    setChecking(true)
    setWrong(null)
    try {
      await giveCode(factorId, code)
      reloadApp()
    } catch (err) {
      setWrong(codeErrorWords(err))
      setTyped('')
      setChecking(false)
    }
  }

  return (
    <main className="flex min-h-[100svh] items-center justify-center px-4 py-10">
      <form
        aria-labelledby="second-step-title"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(typed)
        }}
        className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest p-7 text-center hairline sm:p-9"
      >
        <IconBadge icon={LockIcon} tone="blue" size="lg" className="mx-auto" />
        <p className="mt-5 font-mono text-eyebrow text-on-surface-faint">Second step</p>
        <h1 id="second-step-title" className="mt-2 text-balance text-headline-md text-on-surface">
          Enter the code from your authenticator app
        </h1>
        <p id="second-step-what" className="mt-3 text-body-md text-on-surface-variant">
          Your password was right. Open the authenticator app on your phone and type the six digits it shows for this
          account{email ? <> (<span className="[overflow-wrap:anywhere]">{email}</span>)</> : null}.
        </p>
        <label className="mt-6 flex flex-col gap-2 text-left">
          <span className="font-mono text-eyebrow text-on-surface-faint">Six-digit code</span>
          <input
            type="text"
            name="one-time-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            value={typed}
            aria-describedby={wrong ? 'second-step-wrong' : 'second-step-what'}
            aria-invalid={wrong ? true : undefined}
            onChange={(e) => {
              const next = codeDigits(e.target.value)
              setTyped(next)
              // The sixth digit is the whole of it: nobody should have to find a button.
              if (isWholeCode(next)) void submit(next)
            }}
            className={`${inputClasses} text-center font-mono text-headline-md tracking-[0.3em] tabular-nums`}
          />
        </label>
        {wrong && (
          <p id="second-step-wrong" role="alert" className="mt-3 text-body-sm text-accent-red-soft">
            {wrong}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="submit"
            disabled={checking || !isWholeCode(typed)}
            className="tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-60"
          >
            {checking ? 'Checking…' : 'Finish signing in'}
          </button>
          <button
            type="button"
            disabled={leaving}
            onClick={() => {
              setLeaving(true)
              void signOut().finally(() => setLeaving(false))
            }}
            className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface disabled:opacity-60"
          >
            {leaving ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        <p className="mt-5 text-label-md text-on-surface-faint">
          Lost the phone it is on? Ask the church&rsquo;s Owner to clear your second step. Your password alone will
          sign you in again, and you can set a new one up.
        </p>
      </form>
    </main>
  )
}
