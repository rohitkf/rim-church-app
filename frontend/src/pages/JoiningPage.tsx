import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { Select, triggerClasses } from '../components/Select'
import { DateField } from '../components/DateTimeFields'
import { todayIso } from '../lib/monthGrid'
import { AppMark } from '../components/AppMark'
import { PhoneField } from '../components/PhoneField'
import { AgeNote } from '../components/AgeNote'
import { VisaNoteField } from '../components/VisaNoteField'
import type { PhoneStatus } from '../lib/phone'
import { useErrorText } from '../lib/useErrorText'
import {
  MARITAL_STATUSES,
  VISA_TYPES,
  MISSING_TEXT,
  isSettledStatus,
  invalidAnswers,
  joiningFieldId,
  missingAnswers,
  toProfileRows,
  type JoiningAnswers,
  type MaritalStatus,
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
/** The app's own date field, dressed like the other boxes on this form. */
const fieldTriggerClasses = `${inputClasses} flex items-center justify-between gap-3 text-left`

/** A yes/no that has no default, so an unanswered one is visibly unanswered. */
function YesNo({
  value,
  onChange,
  label,
  yes = 'Yes',
  no = 'No',
  invalid = false,
}: {
  value: boolean | null
  onChange: (next: boolean) => void
  label: string
  yes?: string
  no?: string
  /** Not answered yet, and they have tried to go on. */
  invalid?: boolean
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex gap-2 rounded-full ${invalid ? 'field-error' : ''}`}
    >
      {[
        { on: true, text: yes },
        { on: false, text: no },
      ].map((option) => (
        <button
          key={option.text}
          type="button"
          aria-pressed={value === option.on}
          onClick={() => onChange(option.on)}
          className={`flex-1 rounded-full px-4 py-2.5 text-body-sm transition-colors duration-200 ${
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

/** What is already on record of the half only they and the Owner can read. */
interface StoredStatus {
  visa_type: string | null
  visa_has_expiry: boolean | null
  visa_expiry: string | null
  has_dbs: boolean | null
  visa_note: string | null
}

/**
 * `completing` is the same form for somebody already in (0276): one of its
 * questions has no answer on their profile, so they are back at the door
 * until it does. What they gave before is filled in, the blanks are marked
 * from the start, and the words say why they are seeing it.
 */
export function JoiningPage({ completing = false }: { completing?: boolean }) {
  const { profile, refreshProfile, signOut } = useAuth()
  const errorText = useErrorText()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /*
   * Signed out under their feet. The save then goes up with no sign-in at
   * all, the database refuses an anonymous visitor, and the app used to
   * call that "You don't have permission to do that" — which a newcomer
   * with every right to save their own details could do nothing with
   * (Jessa, November 2026: three refused saves, then signing in again
   * fixed it). So it is said as what it is, with the way out.
   */
  const [signedOut, setSignedOut] = useState(false)
  /** Set on the first attempt to finish, so nothing is red before it is due. */
  const [tried, setTried] = useState(completing)
  /** Their status and DBS answer as saved, read once, when completing. */
  const [stored, setStored] = useState<StoredStatus | null>(null)
  const profileId = profile?.id
  useEffect(() => {
    if (!completing || !profileId) return
    let cancelled = false
    void supabase
      .from('profile_sensitive')
      .select('visa_type, has_dbs, visa_expiry, visa_has_expiry, visa_note')
      .eq('user_id', profileId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setStored(data as StoredStatus)
      })
    return () => {
      cancelled = true
    }
  }, [completing, profileId])
  /** Whether what is in the phone box is a number; the box itself knows. */
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>('empty')

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

  const savedMarital: MaritalStatus | '' =
    MARITAL_STATUSES.find((m) => m.value === profile?.marital_status)?.value ?? ''

  const answers: JoiningAnswers = {
    firstName: edits.firstName ?? profile?.first_name ?? '',
    lastName: edits.lastName ?? profile?.last_name ?? '',
    phone: edits.phone ?? profile?.phone ?? '',
    dob: edits.dob ?? profile?.dob ?? '',
    maritalStatus: edits.maritalStatus ?? savedMarital,
    anniversary: edits.anniversary ?? profile?.anniversary ?? '',
    visaType: edits.visaType ?? stored?.visa_type ?? '',
    // A date on record says there is one, whether or not the yes was ever stored.
    visaHasExpiry: edits.visaHasExpiry ?? stored?.visa_has_expiry ?? (stored?.visa_expiry ? true : null),
    visaExpiry: edits.visaExpiry ?? stored?.visa_expiry ?? '',
    // Asked afresh of a newcomer; somebody completing has answered it before.
    hasDbs: edits.hasDbs ?? (completing && stored ? stored.has_dbs === true : null),
    visaNote: edits.visaNote ?? stored?.visa_note ?? '',
  }

  const set = <K extends keyof JoiningAnswers>(key: K, value: JoiningAnswers[K]) =>
    setEdits((current) => ({ ...current, [key]: value }))

  const missing = missingAnswers(answers)
  const bad = invalidAnswers(answers)
  // A number that is typed but not valid is a problem, not a missing answer.
  const phoneBad = phoneStatus === 'invalid'
  const blocked = missing.length > 0 || phoneBad || Object.keys(bad).length > 0
  // Red when it is blank after a try to go on, or filled in and wrong.
  const wants = (field: keyof JoiningAnswers) => (tried && missing.includes(field)) || !!bad[field]
  const redRing = (field: keyof JoiningAnswers) => (wants(field) ? 'field-error' : '')
  // What is wrong with a field, in words: wrong beats blank, and a blank
  // only speaks up once they have tried to go in.
  const messageFor = (field: keyof JoiningAnswers) =>
    bad[field] ?? (tried && missing.includes(field) ? MISSING_TEXT[field].message : null)
  const problem = (field: keyof JoiningAnswers) => {
    const text = messageFor(field)
    return text ? (
      <span id={`${joiningFieldId(field)}-error`} className="text-label-sm text-error">
        {text}
      </span>
    ) : null
  }
  /** For the control itself: marked wrong, and pointing at the words. */
  const described = (field: keyof JoiningAnswers) =>
    messageFor(field) ? { 'aria-invalid': true, 'aria-describedby': `${joiningFieldId(field)}-error` } : {}
  const settled = isSettledStatus(answers.visaType)

  /*
   * Everything standing between them and the app, in the order it sits on
   * the page — so "take me there" goes to the first, and the list by the
   * button reads top to bottom.
   */
  const ORDER: (keyof JoiningAnswers)[] = [
    'firstName', 'lastName', 'phone', 'dob', 'maritalStatus', 'anniversary',
    'visaType', 'visaHasExpiry', 'visaExpiry', 'hasDbs',
  ]
  // Only questions on the screen: the expiry ones appear once a status is
  // chosen, and naming a question nobody can see is its own confusion.
  const onScreen = (f: keyof JoiningAnswers) =>
    (f !== 'visaHasExpiry' && f !== 'visaExpiry') || !!answers.visaType
  const toFix = ORDER.filter(
    (f) => onScreen(f) && (missing.includes(f) || !!bad[f] || (f === 'phone' && phoneBad)),
  )

  /** Bring a question into view and put the cursor in it. */
  const goTo = (field: keyof JoiningAnswers) => {
    const place = document.getElementById(joiningFieldId(field))
    if (!place) return
    // Guarded: jsdom has no scrollIntoView.
    if (typeof place.scrollIntoView === 'function') place.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // The box to type in before any picker beside it (the phone's country).
    const control =
      place.querySelector<HTMLElement>('input') ??
      place.querySelector<HTMLElement>('button, [tabindex]:not([tabindex="-1"])')
    control?.focus({ preventScroll: true })
  }

  async function finish(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (blocked) {
      // On a phone the blank is nearly always off the screen; a button
      // that does nothing visible is what left people stuck.
      if (toFix[0]) goTo(toFix[0])
      return
    }
    if (!profile) return

    setSaving(true)
    setError(null)
    setSignedOut(false)
    // Ask for the sign-in first: a lapsed one is refreshed here if it can
    // be, and if it cannot there is no point sending the answers.
    const { data: current } = await supabase.auth.getSession()
    const session =
      current.session ?? (await supabase.auth.refreshSession()).data.session
    if (!session) {
      setSaving(false)
      setSignedOut(true)
      return
    }
    const rows = toProfileRows(answers)
    const [{ error: profileError }, { error: sensitiveError }] = await Promise.all([
      supabase
        .from('profiles')
        .update({ ...rows.profile, onboarded_at: profile.onboarded_at ?? new Date().toISOString() })
        .eq('id', profile.id),
      supabase.from('profile_sensitive').update(rows.sensitive).eq('user_id', profile.id),
    ])
    setSaving(false)

    if (profileError || sensitiveError) {
      const err = profileError ?? sensitiveError
      // Refused as nobody: the sign-in lapsed between the check and the save.
      if ((err as { code?: string } | null)?.code === '42501' && !(await supabase.auth.getSession()).data.session) {
        setSignedOut(true)
        return
      }
      setError(errorText(err, 'Could not save your details.'))
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
        {completing
          ? 'A few details are missing.'
          : profile?.first_name
            ? `Welcome, ${profile.first_name}.`
            : 'Welcome.'}
      </h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        {completing
          ? 'The church now asks everybody for these. What you gave before is filled in — add what is marked below and you are straight back in.'
          : 'A few things before you start — they go straight onto your profile, and you can change any of them later.'}
      </p>
      <p className="mt-2 text-body-sm text-on-surface-variant">
        Every question needs an answer unless it says optional.
      </p>

      <form onSubmit={finish} className="mt-6 flex flex-col gap-5">
        <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
            Who you are
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
              <label id={joiningFieldId('firstName')} className={`min-w-0 flex-1 ${labelClasses}`}>
                First name
                <input
                  value={answers.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  autoComplete="given-name"
                  {...described('firstName')}
                  className={`${inputClasses} ${redRing('firstName')}`}
                />
                {problem('firstName')}
              </label>
              <label id={joiningFieldId('lastName')} className={`min-w-0 flex-1 ${labelClasses}`}>
                Last name
                <input
                  value={answers.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  autoComplete="family-name"
                  {...described('lastName')}
                  className={`${inputClasses} ${redRing('lastName')}`}
                />
                {problem('lastName')}
              </label>
            </div>
            <div id={joiningFieldId('phone')} className="flex flex-col gap-1.5">
              <PhoneField
                value={answers.phone}
                onChange={(v) => set('phone', v)}
                onStatus={setPhoneStatus}
                showError={tried}
                normalise
                inputClassName={wants('phone') ? 'field-error' : ''}
              />
              {/* A typed number that is wrong is the field's own to say. */}
              {problem('phone')}
            </div>
            <label id={joiningFieldId('dob')} className={labelClasses}>
              Date of birth
              <DateField
                value={answers.dob}
                onChange={(d) => set('dob', d)}
                label="Date of birth"
                max={todayIso()}
                className={`${fieldTriggerClasses} ${wants('dob') ? 'field-error' : ''}`}
              />
              {messageFor('dob') ? problem('dob') : <AgeNote dob={answers.dob} />}
            </label>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
            Family
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            <label id={joiningFieldId('maritalStatus')} className={labelClasses}>
              Marital status
              <Select
                value={answers.maritalStatus}
                onChange={(value) => set('maritalStatus', value as JoiningAnswers['maritalStatus'])}
                placeholder="Choose one"
                aria-label="Marital status"
                className={`${triggerClasses} ${redRing('maritalStatus')}`}
                options={MARITAL_STATUSES.map((m) => ({ value: m.value, label: m.label }))}
              />
              {problem('maritalStatus')}
            </label>
            {/* Asked of somebody married, and of nobody else: a blank
                anniversary on a single person is not missing information. */}
            {answers.maritalStatus === 'married' && (
              <label id={joiningFieldId('anniversary')} className={labelClasses}>
                Wedding anniversary
                <DateField
                  value={answers.anniversary}
                  onChange={(d) => set('anniversary', d)}
                  label="Wedding anniversary"
                  max={todayIso()}
                  className={`${fieldTriggerClasses} ${wants('anniversary') ? 'field-error' : ''}`}
                />
                {messageFor('anniversary') ? (
                  problem('anniversary')
                ) : (
                  <span className="text-label-sm text-on-surface-faint">
                    Shown on the Celebrations page, like your birthday.
                  </span>
                )}
              </label>
            )}
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
          <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
            Right to be here, and DBS
          </h2>
          <p className="mt-1 text-label-md text-on-surface-faint">
            Only you and the Owner can see these.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <label id={joiningFieldId('visaType')} className={labelClasses}>
              Your status in the UK
              <Select
                value={answers.visaType}
                onChange={(value) => set('visaType', value)}
                placeholder="Choose one"
                aria-label="Your status in the UK"
                className={`${triggerClasses} ${redRing('visaType')}`}
                options={VISA_TYPES.map((v) => ({ value: v.value, label: v.label }))}
              />
              {problem('visaType')}
            </label>

            {/* A citizen and somebody settled here are not asked: their
                status does not run out, and asking implies it does. */}
            {answers.visaType && !settled && (
              <div id={joiningFieldId('visaHasExpiry')} className={labelClasses}>
                <span>Does it have an expiry date?</span>
                <YesNo
                  label="Does your visa have an expiry date?"
                  invalid={wants('visaHasExpiry')}
                  value={answers.visaHasExpiry}
                  onChange={(next) => set('visaHasExpiry', next)}
                />
                {problem('visaHasExpiry')}
              </div>
            )}

            {answers.visaType && !settled && answers.visaHasExpiry === true && (
              <label id={joiningFieldId('visaExpiry')} className={labelClasses}>
                Expiry date
                <DateField
                  value={answers.visaExpiry}
                  onChange={(d) => set('visaExpiry', d)}
                  label="Visa expiry date"
                  className={`${fieldTriggerClasses} ${redRing('visaExpiry')}`}
                />
                {problem('visaExpiry')}
              </label>
            )}

            {answers.visaType && (
              <VisaNoteField
                value={answers.visaNote}
                onChange={(next) => set('visaNote', next)}
                labelClassName={labelClasses}
              />
            )}

            <div id={joiningFieldId('hasDbs')} className={labelClasses}>
              <span>Do you have a valid DBS check?</span>
              <YesNo
                label="Do you have a valid DBS check?"
                invalid={wants('hasDbs')}
                value={answers.hasDbs}
                onChange={(next) => set('hasDbs', next)}
              />
              {problem('hasDbs')}
              <span className="text-label-sm text-on-surface-faint">
                Some teams need one. If you are not sure, answer no — a head will tell you.
              </span>
            </div>
          </div>
        </section>

        {/* What is left, by name, each a way back to it — not a count
            that leaves them hunting up the page for red. */}
        {tried && toFix.length > 0 && (
          <div
            role="alert"
            className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2.5 text-body-sm text-on-error-container"
          >
            <p className="font-medium">
              {toFix.length === 1
                ? 'One thing still needs your attention:'
                : `${toFix.length} things still need your attention:`}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {toFix.map((f) => (
                <li key={f}>
                  <button type="button" onClick={() => goTo(f)} className="text-left underline underline-offset-2">
                    {MISSING_TEXT[f].label}
                    {missing.includes(f) ? '' : ' — check what you entered'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {signedOut && (
          <div
            role="alert"
            className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2.5 text-body-sm text-on-error-container"
          >
            <p className="font-medium">You’ve been signed out on this phone.</p>
            <p className="mt-1">
              Nothing was saved. Sign in again with your email and password, and you’ll come back to
              this form to finish.
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2 rounded-full bg-primary px-4 py-2 text-label-md font-semibold text-on-primary"
            >
              Sign in again
            </button>
          </div>
        )}
        {error && (
          <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-5 py-3 text-body-md font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : completing ? 'Save and carry on' : 'Finish and go in'}
        </button>
      </form>
    </div>
  )
}
