import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { sensitiveByUserSchema, type SensitiveByUser } from '../lib/types'
import { isMissingColumnError } from '../lib/missingColumn'
import { Select } from '../components/Select'
import { DateField } from '../components/DateTimeFields'
import { todayIso } from '../lib/monthGrid'
import { SectionTile, inputClasses } from '../components/Surface'
import { MARITAL_STATUSES, VISA_TYPES, isSettledStatus } from '../lib/joining'
import { YesNoSwitch } from '../components/YesNoSwitch'
import { FamilyCard } from '../components/FamilyCard'
import { showToast } from '../lib/toast'
import { useErrorText } from '../lib/useErrorText'

const labelClasses = 'flex flex-col gap-2 text-body-sm text-on-surface-variant'

/** What the profile row is saved as, in one order, so two can be compared. */
function coreOf(first: string, last: string, phone: string, dob: string, marital: string, anniversary: string) {
  return {
    first_name: first.trim(),
    last_name: last.trim(),
    phone: phone.trim() || null,
    dob: dob || null,
    marital_status: marital || null,
    anniversary: anniversary || null,
  }
}

/** The compliance row as it is saved. */
function sensitiveRowOf(s: SensitiveByUser) {
  const settled = isSettledStatus(s.visa_type)
  return {
    visa_type: s.visa_type,
    has_dbs: s.has_dbs,
    // A status that does not run out cannot carry a date: a stale one
    // from an older visa would outlive it.
    visa_expiry: settled ? null : s.visa_expiry,
    visa_has_expiry: settled ? false : (s.visa_has_expiry ?? null),
    // Blank is no note at all.
    visa_note: s.visa_note?.trim() || null,
  }
}

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [anniversary, setAnniversary] = useState('')
  const [maritalStatus, setMaritalStatus] = useState('')
  const [sensitive, setSensitive] = useState<SensitiveByUser | null>(null)
  const errorText = useErrorText()

  /*
   * Filled in once per person, not on every refresh: the profile is
   * re-read after each save, and resetting the boxes then would throw away
   * whatever was typed while the save was on its way.
   */
  const loadedFor = useRef<string | null>(null)
  const savedCore = useRef<string | null>(null)
  const savedSensitive = useRef<string | null>(null)

  useEffect(() => {
    if (!profile || loadedFor.current === profile.id) return
    loadedFor.current = profile.id
    setFirstName(profile.first_name)
    setLastName(profile.last_name)
    setPhone(profile.phone ?? '')
    setDob(profile.dob ?? '')
    setAnniversary(profile.anniversary ?? '')
    setMaritalStatus(profile.marital_status ?? '')
    savedCore.current = JSON.stringify(coreOf(profile.first_name, profile.last_name, profile.phone ?? '', profile.dob ?? '', profile.marital_status ?? '', profile.anniversary ?? ''))
  }, [profile])

  const profileId = profile?.id
  useEffect(() => {
    if (!profileId) return
    supabase
      .from('profile_sensitive')
      .select('visa_type, has_dbs, visa_expiry, visa_has_expiry, visa_note')
      .eq('user_id', profileId)
      .single()
      .then(({ data }) => {
        if (!data) return setSensitive(null)
        const result = sensitiveByUserSchema.safeParse(data)
        if (!result.success) {
          console.error('profile_sensitive response did not match expected shape:', result.error)
          return setSensitive(null)
        }
        savedSensitive.current = JSON.stringify(sensitiveRowOf(result.data))
        setSensitive(result.data)
      })
  }, [profileId])

  /*
   * Everything saves itself a moment after the last change, and says so.
   * A name cannot be blank, so a cleared name waits to be filled in again
   * rather than saving nothing over somebody's name.
   */
  useEffect(() => {
    if (!profileId || savedCore.current === null) return
    const core = coreOf(firstName, lastName, phone, dob, maritalStatus, anniversary)
    const json = JSON.stringify(core)
    if (json === savedCore.current || !firstName.trim() || !lastName.trim()) return
    const timer = window.setTimeout(async () => {
      // Anniversary arrived in a later migration. If the database hasn't had
      // it applied yet, save everything else rather than losing the edit.
      let { error } = await supabase.from('profiles').update(core).eq('id', profileId)
      if (isMissingColumnError(error, 'anniversary')) {
        const { anniversary: _skip, ...rest } = core
        void _skip
        ;({ error } = await supabase.from('profiles').update(rest).eq('id', profileId))
      }
      if (error) return showToast(errorText(error, 'Could not save your profile.'), 'error')
      savedCore.current = json
      showToast('Profile saved')
      refreshProfile()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [profileId, firstName, lastName, phone, dob, maritalStatus, anniversary, refreshProfile, errorText])

  useEffect(() => {
    if (!profileId || !sensitive || savedSensitive.current === null) return
    const row = sensitiveRowOf(sensitive)
    const json = JSON.stringify(row)
    if (json === savedSensitive.current) return
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from('profile_sensitive').update(row).eq('user_id', profileId)
      if (error) return showToast(errorText(error, 'Could not save your compliance details.'), 'error')
      savedSensitive.current = json
      showToast('Compliance details saved')
    }, 900)
    return () => window.clearTimeout(timer)
  }, [profileId, sensitive, errorText])

  if (!profile) {
    return <p className="text-body-sm text-on-surface-variant">Loading profile…</p>
  }

  return (
    <div className="flex w-full flex-col gap-4">
    <form onSubmit={(e) => e.preventDefault()} className="flex w-full flex-col gap-4">
      <SectionTile title="About you" hint="How your name appears on the rota, in chats and on the teams.">
        {/* Two fields side by side need a phone to be wider than one, so
            below `sm` they stack. `min-w-0` is what lets them shrink at
            all: a flex child will not go below its input's intrinsic
            width without it, which is how this row used to push the whole
            page sideways. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <label className={`min-w-0 flex-1 ${labelClasses}`}>
            First name
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClasses} />
          </label>
          <label className={`min-w-0 flex-1 ${labelClasses}`}>
            Last name
            <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClasses} />
          </label>
        </div>
      </SectionTile>

      <SectionTile title="How to reach you" hint="Only you and the Owner can see these.">
        <div className="flex flex-col gap-4">
          <label className={labelClasses}>
            Email
            <input disabled value={profile.email} className={`${inputClasses} text-on-surface-variant opacity-70`} />
            <span className="text-label-sm text-on-surface-faint">The address you sign in with.</span>
          </label>
          <label className={labelClasses}>
            Phone
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClasses}
            />
          </label>
        </div>
      </SectionTile>

      <SectionTile title="Dates we celebrate" hint="Your birthday and anniversary are shown to everyone on the Celebrations page; your marital status is not. Leave out what doesn’t apply.">
        <div className="flex flex-col gap-4">
          <label className={labelClasses}>
            Date of birth
            <DateField value={dob} onChange={setDob} label="Date of birth" max={todayIso()} clearable />
          </label>
          <label className={labelClasses}>
            Marital status
            <Select
              value={maritalStatus}
              onChange={setMaritalStatus}
              placeholder="Choose one"
              aria-label="Marital status"
              options={MARITAL_STATUSES.map((m) => ({ value: m.value, label: m.label }))}
            />
          </label>
          <label className={labelClasses}>
            Wedding anniversary
            <DateField
              value={anniversary}
              onChange={setAnniversary}
              label="Wedding anniversary"
              max={todayIso()}
              clearable
            />
            <span className="text-label-sm text-on-surface-faint">Optional.</span>
          </label>
        </div>
      </SectionTile>

      {/*
        A section, not a <fieldset>. A legend is laid out inside the box's
        own border, so a phone-width one wraps onto a second line and sits
        on top of the border it was meant to interrupt — which is what made
        this block look broken. A heading above the fields wraps like
        ordinary text and cannot collide with anything.
      */}
      {sensitive && (
        <SectionTile title="Compliance details" hint="Only you and the Owner can see these.">
          <div className="flex flex-col gap-4">
            {/* The same list the joining form offers, so the two cannot
                drift into describing the same person differently. */}
            <label className={labelClasses}>
              Your status in the UK
              <Select
                value={sensitive.visa_type ?? ''}
                onChange={(value) => setSensitive({ ...sensitive, visa_type: value || null })}
                placeholder="Choose one"
                aria-label="Your status in the UK"
                options={VISA_TYPES.map((v) => ({ value: v.value, label: v.label }))}
              />
            </label>
            {/* A citizen and somebody settled here are not asked for an
                expiry: their status does not run out. */}
            {!isSettledStatus(sensitive.visa_type) && (
              <>
                <label className="flex items-start gap-2.5 text-body-sm text-on-surface">
                  <input
                    type="checkbox"
                    checked={sensitive.visa_has_expiry ?? false}
                    onChange={(e) =>
                      setSensitive({
                        ...sensitive,
                        visa_has_expiry: e.target.checked,
                        visa_expiry: e.target.checked ? sensitive.visa_expiry : null,
                      })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0">It has an expiry date</span>
                </label>
                {sensitive.visa_has_expiry && (
                  <label className={labelClasses}>
                    Visa expiry
                    <DateField
                      value={sensitive.visa_expiry ?? ''}
                      onChange={(d) => setSensitive({ ...sensitive, visa_expiry: d || null })}
                      label="Visa expiry"
                      clearable
                    />
                  </label>
                )}
              </>
            )}
            {/* For what a date cannot say: an application still being
                decided, a renewal sent off. Any status can carry one. */}
            {sensitive.visa_type && (
              <>
                <label className={labelClasses}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span>
                      Comment <span className="font-normal text-on-surface-faint">(optional)</span>
                    </span>
                    <span className="font-mono text-label-sm tabular text-on-surface-faint">
                      {(sensitive.visa_note ?? '').length}/300
                    </span>
                  </span>
                  <textarea
                    value={sensitive.visa_note ?? ''}
                    onChange={(e) => setSensitive({ ...sensitive, visa_note: e.target.value })}
                    maxLength={300}
                    rows={3}
                    placeholder="e.g. Applied for a Graduate visa on 3 October, waiting on a decision"
                    className="w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </label>
              </>
            )}
            {/* Yes or No, the way an availability answer is given: a box
                left unticked could mean "no" or "never looked". */}
            <div className="flex flex-col gap-2">
              <span className="text-body-sm text-on-surface-variant">Do you have a valid DBS check?</span>
              <YesNoSwitch
                value={sensitive.has_dbs}
                onChange={(next) => setSensitive({ ...sensitive, has_dbs: next })}
                label="Do you have a valid DBS check?"
              />
            </div>
          </div>
        </SectionTile>
      )}

      <p className="px-1 text-label-sm text-on-surface-faint">Changes save on their own.</p>
    </form>
    {/* Its own saves, outside the form: Enter in an address box
        should not save the whole profile. */}
    <FamilyCard />
    </div>
  )
}
