import { type FormEvent, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { AuthCard, AuthLabel, authInputClasses, authSubmitClasses } from '../components/AuthCard'
import { errorMessage } from '../lib/errorMessage'
import { useAuth } from '../auth/AuthContext'
import { PasswordInput } from '../components/PasswordInput'
import { CheckEmailDialog } from '../components/CheckEmailDialog'
import { alreadyHasAccount } from '../lib/signInWords'
import { nameProblem, tidyName } from '../lib/personName'
import { emailMeant, emailProblem } from '../lib/emailAddress'
import { mailDomainAccepts, mailDomainProblem } from '../lib/mailDomain'
import { confirmationLanding } from '../lib/authLinks'
import { sameEmail } from '../lib/emailDelivery'
import { ConfirmEmailDialog } from '../components/ConfirmEmailDialog'
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
  // Typed a second time, as registering for an event asks (November 2026):
  // a slip is rarely made the same way twice.
  const [emailAgain, setEmailAgain] = useState('')
  // Which of the two boxes has been left, or the form sent: a slip is said then.
  const [emailLeft, setEmailLeft] = useState<{ first?: boolean; again?: boolean }>({})
  // "Is this your email address?" is open, between Sign up and the account.
  const [confirming, setConfirming] = useState(false)
  // The server is being asked whether the address's domain takes mail at
  // all (lib/mailDomain), between Sign up and "Is this your email address?".
  const [checking, setChecking] = useState(false)
  // The address whose domain turned out to take none. Kept as the address,
  // so that changing what is in the box takes the complaint away with it.
  const [noMail, setNoMail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The address the confirmation went to, while the dialog about it is open.
  const [sentTo, setSentTo] = useState<string | null>(null)
  // The address that turned out to have an account already.
  const [taken, setTaken] = useState<string | null>(null)
  // A name is called wrong once its box has been left, or the form sent.
  const [left, setLeft] = useState<{ first?: boolean; last?: boolean }>({})

  const firstProblem = left.first ? nameProblem(firstName, 'First name') : null
  const lastProblem = left.last ? nameProblem(lastName, 'Last name') : null

  // Whether the address can be one at all, and whether the two boxes say the same.
  const emailWrong = email.trim() ? emailProblem(email) : null
  const emailsDiffer = !!email.trim() && !!emailAgain.trim() && !sameEmail(email, emailAgain)
  const emailsAgree = !!emailAgain.trim() && !emailWrong && sameEmail(email, emailAgain)
  // Can be an address, and nothing receives mail where it points: said of
  // the address that was asked about, and of no other.
  const domainDead = !emailWrong && !!noMail && sameEmail(noMail, email)
  const domainMeant = domainDead ? emailMeant(email) : null
  /** Take the address they meant: in the first box, and in the second if the same slip was typed there. */
  const takeMeant = (meant: string) => {
    if (sameEmail(email, emailAgain)) setEmailAgain(meant)
    setEmail(meant)
  }

  const checks = passwordChecks(password)
  const score = passwordScore(password)
  const passwordsMatch = password === confirmPassword
  const canSubmit = checks.minLength && confirmPassword.length > 0 && passwordsMatch

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setTaken(null)
    // Saved as a name is written, and refused here with the reason when it
    // is not one: the database would salvage what it could and say nothing.
    const first = tidyName(firstName)
    const last = tidyName(lastName)
    setFirstName(first)
    setLastName(last)
    setLeft({ first: true, last: true })
    if (nameProblem(first) || nameProblem(last)) return
    // An address that cannot be one gets no confirmation email, and an
    // account nobody can confirm; nor one typed two ways. Said under the
    // boxes, where they are put right.
    setEmailLeft({ first: true, again: true })
    if (emailProblem(email) || !sameEmail(email, emailAgain)) return
    // It can be an address. Whether mail can reach its domain at all is
    // asked next: an account at a domain nobody owns can never be
    // confirmed. Only a definite no stops here; not being able to ask
    // (no signal, a slow answer) stops nobody.
    setChecking(true)
    const accepts = await mailDomainAccepts(email)
    setChecking(false)
    if (accepts === false) {
      setNoMail(email.trim())
      return
    }
    setNoMail(null)
    // Not made yet: the address is shown on its own first, and asked about.
    setConfirming(true)
  }

  /** Make the account, once they have said the address is theirs. */
  async function createAccount() {
    const first = tidyName(firstName)
    const last = tidyName(lastName)
    setSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // Where the link in the email lands is said here, not left to a setting (lib/authLinks).
        options: { emailRedirectTo: confirmationLanding(), data: { first_name: first, last_name: last } },
      })
      if (error) {
        setError(error.message)
        return
      }
      // No account was made and no email sent: say so, rather than "check your email".
      if (alreadyHasAccount(data?.user)) {
        setTaken(email.trim())
        return
      }
      setSentTo(email.trim())
    } catch (err: unknown) {
      setError(errorMessage(err, "Couldn't reach the server. Check your connection and try again."))
    } finally {
      setSubmitting(false)
      // Whatever came of it is said on the form or over it, not behind this.
      setConfirming(false)
    }
  }

  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-blue-soft">
            Sign in
          </Link>
        </>
      }
    >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-2">
              <AuthLabel>First name</AuthLabel>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={() => {
                  setFirstName(tidyName(firstName))
                  setLeft((was) => ({ ...was, first: true }))
                }}
                autoComplete="given-name"
                aria-invalid={firstProblem ? true : undefined}
                aria-describedby={firstProblem ? 'signup-first-problem' : undefined}
                className={authInputClasses}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-2">
              <AuthLabel>Last name</AuthLabel>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onBlur={() => {
                  setLastName(tidyName(lastName))
                  setLeft((was) => ({ ...was, last: true }))
                }}
                autoComplete="family-name"
                aria-invalid={lastProblem ? true : undefined}
                aria-describedby={lastProblem ? 'signup-last-problem' : undefined}
                className={authInputClasses}
              />
            </label>
          </div>
          {/* Outside the labels: words inside one become part of the field's name. */}
          {(firstProblem || lastProblem) && (
            <div role="alert" className="-mt-2 flex flex-col gap-1 text-body-sm text-error">
              {firstProblem && <p id="signup-first-problem">{firstProblem}</p>}
              {lastProblem && <p id="signup-last-problem">{lastProblem}</p>}
            </div>
          )}
          <label className="flex flex-col gap-2">
            <AuthLabel>Email</AuthLabel>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailLeft((was) => ({ ...was, first: true }))}
              aria-invalid={(emailLeft.first && emailWrong) || domainDead ? true : undefined}
              aria-describedby={emailLeft.first && emailWrong ? 'signup-email-problem' : domainDead ? 'signup-email-domain' : undefined}
              className={authInputClasses}
            />
          </label>
          {/* The address is shaped like one, and nothing receives mail at its
              domain: said where it is put right, like every other slip. */}
          {domainDead && (
            <div role="alert" id="signup-email-domain" className="-mt-2 flex flex-col gap-1 text-body-sm">
              <p className="text-error [overflow-wrap:anywhere]">{mailDomainProblem(email)}</p>
              {domainMeant && (
                <p className="text-on-surface [overflow-wrap:anywhere]">
                  Did you mean{' '}
                  <button type="button" onClick={() => takeMeant(domainMeant)} className="tap font-semibold text-accent-blue-soft underline underline-offset-2">
                    {domainMeant}
                  </button>
                  ?
                </p>
              )}
            </div>
          )}
          {/* Outside the label, like the names': why it cannot be an address, and the one they meant. */}
          {emailLeft.first && emailWrong && (
            <div role="alert" id="signup-email-problem" className="-mt-2 flex flex-col gap-1 text-body-sm">
              <p className="text-error">{emailWrong.text}</p>
              {emailWrong.meant && (
                <p className="text-on-surface [overflow-wrap:anywhere]">
                  Did you mean{' '}
                  <button type="button" onClick={() => takeMeant(emailWrong.meant!)} className="tap font-semibold text-accent-blue-soft underline underline-offset-2">
                    {emailWrong.meant}
                  </button>
                  ?
                </p>
              )}
            </div>
          )}
          <label className="flex flex-col gap-2">
            <AuthLabel>Confirm email</AuthLabel>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={254}
              value={emailAgain}
              onChange={(e) => setEmailAgain(e.target.value)}
              onBlur={() => setEmailLeft((was) => ({ ...was, again: true }))}
              aria-invalid={emailLeft.again && emailsDiffer ? true : undefined}
              aria-describedby={emailLeft.again && emailsDiffer ? 'signup-email-again-problem' : undefined}
              className={authInputClasses}
            />
          </label>
          {emailLeft.again && emailsDiffer ? (
            <p role="alert" id="signup-email-again-problem" className="-mt-2 text-body-sm text-error">
              The two email addresses are different. They have to be the same.
            </p>
          ) : emailsAgree ? (
            <p className="-mt-2 text-label-md text-accent-green-soft">The same as the one above.</p>
          ) : (
            <p className="-mt-2 text-label-md text-on-surface-faint">Type it again, so a slip in either shows.</p>
          )}
          <label className="flex flex-col gap-2">
            <AuthLabel>Password</AuthLabel>
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

          <label className="flex flex-col gap-2">
            <AuthLabel>Re-enter password</AuthLabel>
            <PasswordInput value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" />
          </label>
          {confirmPassword.length > 0 && (
            <p className={`-mt-2 font-mono text-label-sm ${passwordsMatch ? 'text-success' : 'text-error'}`}>
              {passwordsMatch ? '✓ Passwords match' : '✗ Passwords don’t match'}
            </p>
          )}

          {error && <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>}
          {taken && (
            <div role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
              <p className="font-medium">There&rsquo;s already an account for {taken}.</p>
              <p className="mt-1">Nothing new was made and no email was sent. Sign in with it, or set a new password if you&rsquo;ve forgotten yours.</p>
              <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                <Link to="/login" className="font-semibold underline">
                  Sign in
                </Link>
                <Link to="/forgot-password" state={{ email: taken }} className="font-semibold underline">
                  Reset my password
                </Link>
              </p>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || checking || !canSubmit}
            className={`mt-1.5 ${authSubmitClasses}`}
          >
            {submitting ? 'Creating account…' : checking ? 'Checking the address…' : 'Sign up'}
          </button>
        </form>
      {/* Over the form rather than instead of it: "wrong address" is one tap
          back to what they typed. */}
      {sentTo && <CheckEmailDialog email={sentTo} onClose={() => setSentTo(null)} />}
      {/* The address on its own, to be read, before anything is made
          (components/ConfirmEmailDialog): Yes waits five seconds. */}
      {confirming && (
        <ConfirmEmailDialog
          email={email.trim()}
          confirmLabel="Sign up"
          note="The link to confirm your account is sent here, and nowhere else. Check each letter: one slip and it never arrives."
          busyLabel="Creating account…"
          busy={submitting}
          onConfirm={() => void createAccount()}
          onChange={() => setConfirming(false)}
          // The spelling offered is taken for both boxes: it is one address.
          onUse={(next) => {
            setEmail(next)
            setEmailAgain(next)
          }}
        />
      )}
    </AuthCard>
  )
}
