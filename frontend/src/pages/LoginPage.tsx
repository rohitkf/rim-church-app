import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import { useAuth } from '../auth/AuthContext'
import { PasswordInput } from '../components/PasswordInput'
import { AuthCard, AuthLabel, authInputClasses, authSubmitClasses } from '../components/AuthCard'

export function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    // supabase-js reports most failures as a returned error, but a request
    // that never completes — or one this client's deadline cuts off —
    // rejects instead. Without a catch that left the button on
    // "Signing in…" for ever, which looks like progress and isn't.
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } catch (err: unknown) {
      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."))
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
          <p className="rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`mt-1.5 ${authSubmitClasses}`}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  )
}
