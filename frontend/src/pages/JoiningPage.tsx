import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { Select } from '../components/Select'
import { AppMark } from '../components/AppMark'
import { useErrorText } from '../lib/useErrorText'
import {
  MARITAL_STATUSES,
  VISA_TYPES,
  isSettledStatus,
  missingAnswers,
  toProfileRows,
  type JoiningAnswers,
} from '../lib/joining'

/**
 * The form somebody fills in once, on their way in.
 *
 * Signing up took an email and a password. Everything the church actually
 * runs on — a number to ring, a birthday to mark, what allows somebody to
 * work here, whether they hold a DBS check — was left to a Settings page
 * people visit once and never again, so the records were whatever anybody
 * had got round to typing.
 *
 * So it is asked here, and it is not skippable: until it is answered the
 * app is this page. That is a strong thing to do to somebody who has just
 * arrived, and it is the only honest place to put it — a rota built on
 * half-known people is guesswork, and the compliance half of it is not
 * guesswork anybody should be doing.
 *
 * Two questions are only asked when they mean something. An anniversary is
 * asked of somebody married. An expiry date is asked of somebody whose
 * status runs out — and then only if they say theirs has one, because "no
 * expiry" and "nobody has asked" are different facts and the app stores
 * them differently.
 */

const inputClasses =
  'w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2.5 text-body-md text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary'
const labelClasses = 'flex flex-col gap-1.5 text-body-sm text-on-surface-variant'

/** A yes/no that has no default, so an unanswered one is visibly unanswered. */
function YesNo({
  value,
  onChange,
  label,
  yes = 'Yes',
  no = 'No',
}: {
  value: boolean | null
  onChange: (next: boolean) => void
  label: string
  yes?: string
  no?: string
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      {[
        { on: true, text: yes },
        { on: false, text: no },
      ].map((option) => (
        <button
          key={option.text}
          type="button"
          aria-pressed={value === option.on}
          onClick={() => onChange(option.on)}
          className={`flex-1 rounded-full px-4 py-2.5 text-body-sm transition-colors duration-300 ${
            value === option.on
              ? 'bg-primary font-semibold text-on-primary'
              : 'bg-raised text-on-surface hairline hover:border-secondary'
          }`}
        >
          {option.text}
        </button>
      ))}
    </div>
  )
}

export function JoiningPage() {
  const { profile, refreshProfile } = useAuth()
  const errorText = useErrorText()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set on the first attempt to finish, so nothing is red before it is due. */
  const [tried, setTried] = useState(false)

  /*
   * What they have typed, over what signing up already knew.
   *
   * Held as the edits alone rather than as a filled-in copy of the
   * profile, so there is no effect syncing one piece of state from
   * another — which is the shape that loops the moment the thing it
   * syncs from is a new object on every render, as a context's value is.
   * An untouched field simply reads through to the profile.
   */
  const [edits, setEdits] = useState<Partial<JoiningAnswers>>({})

  const answers: JoiningAnswers = {
    firstName: edits.firstName ?? profile?.first_name ?? '',
    lastName: edits.lastName ?? profile?.last_name ?? '',
    phone: edits.phone ?? profile?.phone ?? '',
    dob: edits.dob ?? profile?.dob ?? '',
    maritalStatus: edits.maritalStatus ?? '',
    anniversary: edits.anniversary ?? profile?.anniversary ?? '',
    visaType: edits.visaType ?? '',
    visaHasExpiry: edits.visaHasExpiry ?? null,
    visaExpiry: edits.visaExpiry ?? '',
    hasDbs: edits.hasDbs ?? null,
  }


  const set = <K extends keyof JoiningAnswers>(key: K, value: JoiningAnswers[K]) =>
    setEdits((current) => ({ ...current, [key]: value }))

  const missing = missingAnswers(answers)
  const wants = (field: keyof JoiningAnswers) => tried && missing.includes(field)
  const settled = isSettledStatus(answers.visaType)

  async function finish(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (missing.length > 0) return
    if (!profile) return

    setSaving(true)
    setError(null)
    const rows = toProfileRows(answers)
    const [{ error: profileError }, { error: sensitiveError }] = await Promise.all([
      supabase
        .from('profiles')
        .update({ ...rows.profile, onboarded_at: new Date().toISOString() })
        .eq('id', profile.id),
      supabase.from('profile_sensitive').update(rows.sensitive).eq('user_id', profile.id),
    ])
    setSaving(false)

    if (profileError || sensitiveError) {
      setError(errorText(profileError ?? sensitiveError, 'Could not save your details.'))
      return
    }
    await refreshProfile()
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <AppMark />
        <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
          Rehoboth International Ministries
        </span>
      </div>

      <h1 className="text-headline-lg">
        {profile?.first_name ? `Welcome, ${profile.first_name}.` : 'Welcome.'}
      </h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        A few things before you start — they go straight onto your profile, and you can change any
        of them later.
      </p>

      <form onSubmit={finish} className="mt-6 flex flex-col gap-5">
        <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
            Who you are
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
              <label className={`min-w-0 flex-1 ${labelClasses}`}>
                First name
                <input
                  value={answers.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  className={`${inputClasses} ${wants('firstName') ? 'ring-1 ring-error' : ''}`}
                />
              </label>
              <label className={`min-w-0 flex-1 ${labelClasses}`}>
                Last name
                <input
                  value={answers.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  className={`${inputClasses} ${wants('lastName') ? 'ring-1 ring-error' : ''}`}
                />
              </label>
            </div>
            <label className={labelClasses}>
              Phone
              <input
                value={answers.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="07…"
                inputMode="tel"
                className={`${inputClasses} ${wants('phone') ? 'ring-1 ring-error' : ''}`}
              />
            </label>
            <label className={labelClasses}>
              Date of birth
              <input
                type="date"
                value={answers.dob}
                onChange={(e) => set('dob', e.target.value)}
                className={`${inputClasses} [color-scheme:dark] ${wants('dob') ? 'ring-1 ring-error' : ''}`}
              />
            </label>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
            Family
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            <label className={labelClasses}>
              Marital status
              <Select
                value={answers.maritalStatus}
                onChange={(value) => set('maritalStatus', value as JoiningAnswers['maritalStatus'])}
                placeholder="Choose one"
                aria-label="Marital status"
                options={MARITAL_STATUSES.map((m) => ({ value: m.value, label: m.label }))}
              />
            </label>
            {/* Asked of somebody married, and of nobody else: a blank
                anniversary on a single person is not missing information. */}
            {answers.maritalStatus === 'married' && (
              <label className={labelClasses}>
                Wedding anniversary
                <input
                  type="date"
                  value={answers.anniversary}
                  onChange={(e) => set('anniversary', e.target.value)}
                  className={`${inputClasses} [color-scheme:dark] ${
                    wants('anniversary') ? 'ring-1 ring-error' : ''
                  }`}
                />
                <span className="text-label-sm text-on-surface-faint">
                  Shown on the Celebrations page, like your birthday.
                </span>
              </label>
            )}
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
            Right to be here, and DBS
          </h2>
          <p className="mt-1 text-label-md text-on-surface-faint">
            Only you and an Admin can see these.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <label className={labelClasses}>
              Your status in the UK
              <Select
                value={answers.visaType}
                onChange={(value) => set('visaType', value)}
                placeholder="Choose one"
                aria-label="Your status in the UK"
                options={VISA_TYPES.map((v) => ({ value: v.value, label: v.label }))}
              />
            </label>

            {/* A citizen and somebody settled here are not asked: their
                status does not run out, and asking implies it does. */}
            {answers.visaType && !settled && (
              <div className={labelClasses}>
                <span>Does it have an expiry date?</span>
                <YesNo
                  label="Does your visa have an expiry date?"
                  value={answers.visaHasExpiry}
                  onChange={(next) => set('visaHasExpiry', next)}
                />
              </div>
            )}

            {answers.visaType && !settled && answers.visaHasExpiry === true && (
              <label className={labelClasses}>
                Expiry date
                <input
                  type="date"
                  value={answers.visaExpiry}
                  onChange={(e) => set('visaExpiry', e.target.value)}
                  className={`${inputClasses} [color-scheme:dark] ${
                    wants('visaExpiry') ? 'ring-1 ring-error' : ''
                  }`}
                />
              </label>
            )}

            <div className={labelClasses}>
              <span>Do you have a valid DBS check?</span>
              <YesNo
                label="Do you have a valid DBS check?"
                value={answers.hasDbs}
                onChange={(next) => set('hasDbs', next)}
              />
              <span className="text-label-sm text-on-surface-faint">
                Some teams need one. If you are not sure, answer no — a head will tell you.
              </span>
            </div>
          </div>
        </section>

        {tried && missing.length > 0 && (
          <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            There {missing.length === 1 ? 'is one thing' : `are ${missing.length} things`} still to
            answer.
          </p>
        )}
        {error && (
          <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-5 py-3 text-body-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Finish and go in'}
        </button>
      </form>
    </div>
  )
}
