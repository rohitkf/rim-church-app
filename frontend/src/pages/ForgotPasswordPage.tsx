import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
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
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-lowest p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="font-mono text-label-md">RIM</span>
          </div>
          <div className="text-headline-md">Rehoboth International Ministries</div>
        </div>

        {sent ? (
          <>
            <h1 className="mb-2 text-headline-lg">Check your email</h1>
            <p className="text-body-sm text-on-surface-variant">
              If an account exists for {email.trim()}, we've sent a link to reset the password. The
              link expires after an hour.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-headline-lg">Reset your password</h1>
            <p className="mb-6 text-body-sm text-on-surface-variant">
              Enter the email you signed up with and we'll send you a reset link.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
                />
              </label>
              {error && (
                <p className="rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-body-sm text-on-surface-variant">
          <Link to="/login" className="font-medium text-secondary">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
