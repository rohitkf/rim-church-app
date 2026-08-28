import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { AuthCard, AuthLabel, authInputClasses, authSubmitClasses } from '../components/AuthCard'
import { errorMessage } from '../lib/errorMessage'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    let error: { message: string } | null = null
    try {
      ;({ error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      }))
    } catch (err: unknown) {
      // A request that never arrived is not the same as a rejected address,
      // so this one does get reported rather than silently claiming success.
      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."))
      setSubmitting(false)
      return
    }
    setSubmitting(false)
    // Deliberately the same outcome whether or not the address is
    // registered: telling a stranger which emails have accounts here is
    // not something a church directory should do.
    if (error && !/rate|limit/i.test(error.message)) {
      setSent(true)
      return
    }
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <AuthCard
      title={sent ? 'Check your email' : 'Reset your password'}
      footer={
        <Link to="/login" className="font-medium text-primary">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="text-body-sm text-on-surface-variant">
          If an account exists for {email.trim()}, we&rsquo;ve sent a link to reset the password.
          The link expires after an hour.
        </p>
      ) : (
        <>
          <p className="text-body-sm text-on-surface-variant">
            Enter the email you signed up with and we&rsquo;ll send you a reset link.
          </p>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
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
            {error && (
              <p className="rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
                {error}
              </p>
            )}
            <button type="submit" disabled={submitting} className={`mt-1.5 ${authSubmitClasses}`}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
    </AuthCard>
  )
}
