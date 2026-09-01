import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { AuthCard, AuthLabel, authInputClasses, authSubmitClasses } from '../components/AuthCard'
import { errorMessage } from '../lib/errorMessage'
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
 * Where the emailed link lands — for a password somebody has forgotten, and
 * for an invitation, which is the same act at a different moment. Supabase
 * turns either link into a short-lived session as the page loads, and that
 * session is what authorises the change below; the route stays outside
 * ProtectedRoute so it doesn't bounce a signed-in visitor away.
 *
 * An invited person arrives with an account already made for them and no
 * name on it — `inviteUserByEmail` has no name to give. If the inviter did
 * not supply one, this is the single moment that person is guaranteed to be
 * looking at the app, so it asks. Getting it here is the difference between
 * a rota that reads "Grace Mensah" and one with a blank where a name should
 * be, waiting for somebody to notice and go hunting through Profile.
 *
 * The page decides which it is from the profile rather than from the URL:
 * supabase-js strips the token fragment as soon as it has read the session,
 * so `type=invite` is gone by the time React looks. "This profile has no
 * name" is the fact worth acting on anyway — it is true of an invited
 * person, and false of somebody resetting a password ten months in.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [linkValid, setLinkValid] = useState(false)
  // Null until the profile has been looked at: the form must not flash the
  // wrong wording at somebody while it decides.
  const [needsName, setNeedsName] = useState<boolean | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Asked once and then left alone. The auth listener fires again on a token
  // refresh and on the password change itself, and a second read would both
  // wipe what they are halfway through typing and — once the name has just
  // been saved — decide they never needed asking, changing the wording of
  // the page underneath them at the last moment.
  const decided = useRef(false)

  useEffect(() => {
    let cancelled = false

    /** Has this person got a name on file, or did they arrive without one? */
    async function readProfile(userId: string) {
      if (decided.current) return
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', userId)
        .maybeSingle()
      if (cancelled || decided.current) return
      const first = (data?.first_name ?? '').trim()
      const last = (data?.last_name ?? '').trim()
      decided.current = true
      setFirstName(first)
      setLastName(last)
      // No row at all is treated as "no name": better to ask than to assume.
      setNeedsName(!first && !last)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setLinkValid(!!session)
      setReady(true)
      if (session) void readProfile(session.user.id)
    })
    // The session can land a beat after mount, while Supabase parses the
    // recovery token out of the URL.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session) {
        setLinkValid(true)
        void readProfile(session.user.id)
      }
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
  const welcoming = needsName === true
  // A first name is asked for, a surname is offered. Blocking somebody out
  // of the app over a surname would be a worse fault than the blank row
  // this is here to prevent.
  const nameGiven = !welcoming || firstName.trim().length > 0
  const canSubmit =
    checks.minLength && confirmPassword.length > 0 && passwordsMatch && nameGiven

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      // The name goes first. If it fails, nothing has been changed and they
      // can simply try again; the other way round would sign them in
      // nameless, which is the state this exists to prevent.
      if (welcoming) {
        const { data: userData } = await supabase.auth.getUser()
        const id = userData?.user?.id
        if (!id) {
          setError('Your link has expired. Ask for another one.')
          return
        }
        const { error: nameError } = await supabase
          .from('profiles')
          .update({ first_name: firstName.trim(), last_name: lastName.trim() })
          .eq('id', id)
        if (nameError) {
          setError(nameError.message)
          return
        }
      }

      const { error } = await supabase.auth.updateUser({ password })
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

  return (
    <AuthCard
      title={
        !ready
          ? 'Checking your link…'
          : done
            ? welcoming
              ? 'You’re all set'
              : 'Password updated'
            : !linkValid
              ? 'Link expired'
              : welcoming
                ? 'Welcome — finish setting up'
                : 'Choose a new password'
      }
    >

        {!ready ? (
          <p className="text-body-sm text-on-surface-variant">One moment.</p>
        ) : done ? (
          <>
            <p className="text-body-sm text-on-surface-variant">
              {welcoming
                ? `Good to have you, ${firstName.trim() || 'friend'}. You're signed in.`
                : "You're signed in with your new password."}
            </p>
            <button
              onClick={() => navigate('/')}
              className={`mt-6 ${authSubmitClasses}`}
            >
              Go to Dashboard
            </button>
          </>
        ) : !linkValid ? (
          <>
            <p className="text-body-sm text-on-surface-variant">
              This reset link is no longer valid — they expire after an hour and can only be used
              once. Request a new one and try again.
            </p>
            <Link
              to="/forgot-password"
              className={`mt-6 ${authSubmitClasses}`}
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            {welcoming && (
              <p className="mb-4 text-body-sm text-on-surface-variant">
                You’ve been invited to the church’s app. Tell us your name and choose a password —
                your name is what the rota and the team lists will show.
              </p>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {welcoming && (
                <>
                  <label className="flex flex-col gap-2">
                    <AuthLabel>First name</AuthLabel>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      maxLength={80}
                      autoComplete="given-name"
                      autoFocus
                      placeholder="Grace"
                      className={authInputClasses}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    <AuthLabel>Last name</AuthLabel>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      maxLength={80}
                      autoComplete="family-name"
                      placeholder="Mensah"
                      className={authInputClasses}
                    />
                  </label>
                </>
              )}

              <label className="flex flex-col gap-2">
                <AuthLabel>{welcoming ? 'Choose a password' : 'New password'}</AuthLabel>
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

              <label className="flex flex-col gap-2">
                <AuthLabel>{welcoming ? 'Re-enter password' : 'Re-enter new password'}</AuthLabel>
                <PasswordInput value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" />
              </label>
              {confirmPassword.length > 0 && (
                <p className={`-mt-2 font-mono text-label-sm ${passwordsMatch ? 'text-success' : 'text-error'}`}>
                  {passwordsMatch ? '✓ Passwords match' : '✗ Passwords don’t match'}
                </p>
              )}

              {error && (
                <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {submitting
                  ? welcoming
                    ? 'Setting up…'
                    : 'Updating…'
                  : welcoming
                    ? 'Set password and continue'
                    : 'Update password'}
              </button>
            </form>
          </>
        )}
    </AuthCard>
  )
}
