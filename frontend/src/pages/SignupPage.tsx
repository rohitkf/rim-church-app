import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import { useAuth } from '../auth/AuthContext'
import { PasswordInput } from '../components/PasswordInput'
import { passwordChecks, passwordScore, strengthColorClass, strengthLabel } from '../lib/passwordStrength'

function CheckHint({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-1.5 ${ok ? 'text-success' : 'text-on-surface-variant'}`}>
      <span className="font-mono">{ok ? '✓' : '·'}</span>
      {children}
    </li>
  )
}

export function SignupPage() {
  const { session } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const checks = passwordChecks(password)
  const score = passwordScore(password)
  const passwordsMatch = password === confirmPassword
  const canSubmit = checks.minLength && confirmPassword.length > 0 && passwordsMatch

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { first_name: firstName, last_name: lastName } },
      })
      if (error) {
        setError(error.message)
        return
      }
      setDone(true)
    } catch (err: unknown) {
      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-lowest hairline p-8 text-center">
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
    <div className="flex min-h-[100svh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-surface-lowest hairline p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <span className="font-mono text-label-md">RIM</span>
          </div>
          <div className="text-headline-md">Rehoboth International Ministries</div>
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
                className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
              Last name
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
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
              className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            Password
            <PasswordInput value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" />
          </label>

          {password.length > 0 && (
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-1.5 flex-1 gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`flex-1 rounded-full ${score >= step ? strengthColorClass(score) : 'bg-surface-container'}`}
                    />
                  ))}
                </div>
                <span className="font-mono text-label-sm text-on-surface-variant">{strengthLabel[score]}</span>
              </div>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-label-sm">
                <CheckHint ok={checks.minLength}>8+ characters</CheckHint>
                <CheckHint ok={checks.hasUpperLower}>Upper & lower case</CheckHint>
                <CheckHint ok={checks.hasNumber}>A number</CheckHint>
                <CheckHint ok={checks.hasSymbol}>A symbol</CheckHint>
              </ul>
            </div>
          )}

          <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
            Re-enter password
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" />
          </label>
          {confirmPassword.length > 0 && (
            <p className={`-mt-2 font-mono text-label-sm ${passwordsMatch ? 'text-success' : 'text-error'}`}>
              {passwordsMatch ? '✓ Passwords match' : '✗ Passwords don’t match'}
            </p>
          )}

          {error && <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
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
