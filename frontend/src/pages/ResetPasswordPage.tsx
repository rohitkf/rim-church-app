import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
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

/**
 * Where the emailed recovery link lands. Supabase turns the link into a
 * short-lived session as the page loads, which is what authorises the
 * password change below — so this route stays outside ProtectedRoute and
 * doesn't bounce a signed-in visitor away.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [linkValid, setLinkValid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setLinkValid(!!session)
      setReady(true)
    })
    // The session can land a beat after mount, while Supabase parses the
    // recovery token out of the URL.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session) setLinkValid(true)
      setReady(true)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const checks = passwordChecks(password)
  const score = passwordScore(password)
  const passwordsMatch = password === confirmPassword
  const canSubmit = checks.minLength && confirmPassword.length > 0 && passwordsMatch

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
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

        {!ready ? (
          <p className="text-body-sm text-on-surface-variant">Checking your link…</p>
        ) : done ? (
          <>
            <h1 className="mb-2 text-headline-lg">Password updated</h1>
            <p className="text-body-sm text-on-surface-variant">You're signed in with your new password.</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 w-full rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90"
            >
              Go to Dashboard
            </button>
          </>
        ) : !linkValid ? (
          <>
            <h1 className="mb-2 text-headline-lg">Link expired</h1>
            <p className="text-body-sm text-on-surface-variant">
              This reset link is no longer valid — they expire after an hour and can only be used
              once. Request a new one and try again.
            </p>
            <Link
              to="/forgot-password"
              className="mt-6 inline-block rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="mb-6 text-headline-lg">Choose a new password</h1>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                New password
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
                    <CheckHint ok={checks.hasUpperLower}>Upper &amp; lower case</CheckHint>
                    <CheckHint ok={checks.hasNumber}>A number</CheckHint>
                    <CheckHint ok={checks.hasSymbol}>A symbol</CheckHint>
                  </ul>
                </div>
              )}

              <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                Re-enter new password
                <PasswordInput value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" />
              </label>
              {confirmPassword.length > 0 && (
                <p className={`-mt-2 font-mono text-label-sm ${passwordsMatch ? 'text-success' : 'text-error'}`}>
                  {passwordsMatch ? '✓ Passwords match' : '✗ Passwords don’t match'}
                </p>
              )}

              {error && (
                <p className="rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
