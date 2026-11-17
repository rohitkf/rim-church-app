import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { probeAuthServer, reachabilityAdvice } from '../lib/authProbe'
import { signInViaProxy } from '../lib/signInFallback'
import { hedge, watch } from '../lib/signInHedge'
import { errorMessage } from '../lib/errorMessage'
import { useAuth } from '../auth/AuthContext'
import { whereTheyWereHeaded } from '../lib/afterSignIn'
import { isWrongPassword } from '../lib/signInWords'
import { PasswordInput } from '../components/PasswordInput'
import { AuthCard, AuthLabel, authInputClasses, authSubmitClasses } from '../components/AuthCard'

/** Longer than any healthy sign-in, short enough to still be an answer. */
const SIGN_IN_TIMEOUT_MS = 20_000

/**
 * How long to give the direct route before quietly trying the other one
 * alongside it. Long enough that a merely slow network is never raced,
 * short enough that someone whose network drops these requests entirely
 * doesn't stand there for twenty seconds first.
 */
const HEDGE_AFTER_MS = 6_000

function deadline(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error('The server didn’t answer the sign-in request.')),
      ms,
    )
  })
}

export function LoginPage() {
  const removed = new URLSearchParams(useLocation().search).get('removed') === '1'
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [advice, setAdvice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) {
    return <Navigate to={whereTheyWereHeaded(location.state)} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setAdvice(null)
    setSubmitting(true)
    // supabase-js reports most failures as a returned error, but a request
    // that never completes — or one this client's deadline cuts off —
    // rejects instead. Without a catch that left the button on
    // "Signing in…" for ever, which looks like progress and isn't.
    try {
      // Whether the direct road has still said nothing: the only time the
      // other one is worth trying alongside it (lib/signInHedge).
      const direct = watch(supabase.auth.signInWithPassword({ email, password }))
      const signIn = direct.answer.then((result) => ({ kind: 'direct' as const, result }))

      // The client's own deadline is a minute, which is right for a large
      // upload and far too long to stand at a sign-in button. Twenty
      // seconds is longer than any healthy login and short enough to still
      // feel like an answer — and after six of them the other road is
      // tried alongside this one rather than after it.
      const outcome = await Promise.race([
        signIn,
        hedge(HEDGE_AFTER_MS, direct.silent, () => signInViaProxy(email, password)).then(() => ({ kind: 'proxy' as const })),
        deadline(SIGN_IN_TIMEOUT_MS),
      ])

      // The proxy winning means it has already established the session;
      // there is nothing left to report.
      if (outcome.kind === 'direct' && outcome.result.error) setError(outcome.result.error.message)
    } catch (err: unknown) {
      // No answer at all. Before reporting anything, try the same-origin
      // route: on a network that drops requests to the API host but not
      // to this one, that is the difference between signing in and not.
      const fallback = await signInViaProxy(email, password)
      if (fallback.ok) return
      if (fallback.message) {
        // It answered and refused — a wrong password, say. That is the
        // real reason, and far more useful than anything about routes.
        setError(fallback.message)
        return
      }

      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."))
      // Neither road answered. Asking the health endpoint — a plain GET
      // nothing preflights or filters specially — says which half is
      // closed, so the message can be about the right thing.
      setAdvice(reachabilityAdvice(await probeAuthServer()))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Sign in"
      footer={
        <>
          No account yet?{' '}
          <Link to="/signup" className="font-medium text-accent-blue-soft">
            Sign up
          </Link>
        </>
      }
    >
      {/* Somebody whose account was removed while they had the app open is
          sent here by the query cache. Without a word they would assume
          they had been signed out by accident and try again, and again. */}
      {removed && (
        <div className="mb-4 rounded-[var(--radius-chip)] bg-surface-container px-4 py-3 text-body-sm text-on-surface-variant">
          <p>Your account is no longer active. Speak to a church Admin if you think that is wrong.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-2">
          <AuthLabel>Email</AuthLabel>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClasses}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-baseline justify-between gap-2">
            <AuthLabel>Password</AuthLabel>
            <Link to="/forgot-password" state={{ email: email.trim() }} className="text-label-sm font-medium text-accent-blue-soft">
              Forgot?
            </Link>
          </span>
          <PasswordInput
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div className="rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {isWrongPassword(error) ? (
              <>
                <p className="font-medium">That email and password don&rsquo;t match.</p>
                <p className="mt-1">
                  Check the email address first. If the password is the part you&rsquo;re not sure of,
                  trying it again won&rsquo;t help &mdash; set a new one instead.
                </p>
                <Link
                  to="/forgot-password"
                  state={{ email: email.trim() }}
                  className="mt-2 inline-block font-semibold underline"
                >
                  Reset my password
                </Link>
              </>
            ) : (
              <p>{error}</p>
            )}
            {advice && <p className="mt-2 opacity-90">{advice}</p>}
          </div>
        )}

        <button type="submit" disabled={submitting} className={`mt-1.5 ${authSubmitClasses}`}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  )
}
