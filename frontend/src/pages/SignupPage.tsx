import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

export function SignupPage() {
  const { session } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName } },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-lowest p-8 text-center">
          <h1 className="mb-2 text-headline-lg">Check your email</h1>
          <p className="text-body-sm text-on-surface-variant">
            We sent a confirmation link to {email}. Sign in once you've confirmed your account.
          </p>
          <Link to="/login" className="mt-6 inline-block text-body-sm font-medium text-secondary">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface-lowest p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="font-mono text-label-md">SO</span>
          </div>
          <div className="text-headline-md">Sanctuary Ops</div>
        </div>
        <h1 className="mb-6 text-headline-lg">Create an account</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
              First name
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
              Last name
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
              />
            </label>
          </div>
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
          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          {error && <p className="rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="mt-6 text-body-sm text-on-surface-variant">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-secondary">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
