import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { probeAuthServer, reachabilityAdvice } from '../lib/authProbe'
import { errorMessage } from '../lib/errorMessage'
import { useAuth } from '../auth/AuthContext'
import { PasswordInput } from '../components/PasswordInput'
import { AuthCard, AuthLabel, authInputClasses, authSubmitClasses } from '../components/AuthCard'

/** Longer than any healthy sign-in, short enough to still be an answer. */
const SIGN_IN_TIMEOUT_MS = 20_000

function deadline(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(
      () => reject(new Error('The server didn’t answer the sign-in request.')),
      ms,
    )
  })
}

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [advice, setAdvice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={redirectTo} replace />
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
      const signIn = supabase.auth.signInWithPassword({ email, password })
      // The client's own deadline is a minute, which is right for a large
      // upload and far too long to stand at a sign-in button. Twenty
      // seconds is longer than any healthy login and short enough to still
      // feel like an answer.
      const { error } = await Promise.race([signIn, deadline(SIGN_IN_TIMEOUT_MS)])
      if (error) setError(error.message)
    } catch (err: unknown) {
      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."))
      // A sign-in that fails without the server ever answering leaves a
      // person with nothing to do differently. Asking the health endpoint
      // — a plain GET nothing preflights or filters specially — says which
      // half of the road is closed.
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
          <Link to="/signup" className="font-medium text-primary">
            Sign up
          </Link>
        </>
      }
    >
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
            <Link to="/forgot-password" className="text-label-sm font-medium text-primary">
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
            <p>{error}</p>
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
