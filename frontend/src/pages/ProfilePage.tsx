import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { sensitiveByUserSchema, type SensitiveByUser } from '../lib/types'
import { isMissingColumnError } from '../lib/missingColumn'
import { Select } from '../components/Select'
import { DateField } from '../components/DateTimeFields'
import { todayIso } from '../lib/monthGrid'
import { SectionTile, inputClasses } from '../components/Surface'
import {
  EMERGENCY_NAME_LIMIT,
  EMERGENCY_RELATIONS,
  MARITAL_STATUSES,
  VISA_TYPES,
  emergencyProblems,
  emergencyRelationOf,
  isSettledStatus,
} from '../lib/joining'
import { YesNoSwitch } from '../components/YesNoSwitch'
import { FamilyCard } from '../components/FamilyCard'
import { showToast } from '../lib/toast'
import { PhoneField } from '../components/PhoneField'
import { AgeNote } from '../components/AgeNote'
import { VisaNoteField } from '../components/VisaNoteField'
import { useErrorText } from '../lib/useErrorText'

const labelClasses = 'flex flex-col gap-2 text-body-sm text-on-surface-variant'

/** What the profile row is saved as, in one order, so two can be compared. */
function coreOf(
  first: string,
  last: string,
  phone: string,
  dob: string,
  marital: string,
  anniversary: string,
  emergency: { name: string; relation: string; phone: string },
) {
  return {
    first_name: first.trim(),
    last_name: last.trim(),
    phone: phone.trim() || null,
    dob: dob || null,
    marital_status: marital || null,
    anniversary: anniversary || null,
    emergency_contact_name: emergency.name.trim() || null,
    emergency_contact_relation: emergency.relation || null,
    emergency_contact_phone: emergency.phone.trim() || null,
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
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyRelation, setEmergencyRelation] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  /** Who to ring as last saved: what is kept while the boxes hold something that cannot be. */
  const savedEmergency = useRef({ name: '', relation: '', phone: '' })
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
    const emergency = {
      name: profile.emergency_contact_name ?? '',
      // A value this app has never heard of reads as not answered, and is asked for.
      relation: emergencyRelationOf(profile.emergency_contact_relation),
      phone: profile.emergency_contact_phone ?? '',
    }
    setEmergencyName(emergency.name)
    setEmergencyRelation(emergency.relation)
    setEmergencyPhone(emergency.phone)
    savedEmergency.current = emergency
    savedCore.current = JSON.stringify(coreOf(profile.first_name, profile.last_name, profile.phone ?? '', profile.dob ?? '', profile.marital_status ?? '', profile.anniversary ?? '', emergency))
  }, [profile])

  /*
   * Who to ring is asked of everybody (0301), so it is never saved blank
   * or wrong over a good answer: a name with no number, a number with no
   * name, nobody said who they are (0302), or somebody's own number waits — and says what it is waiting
   * for — while everything else on the page goes on saving.
   */
  const emergencyBad = emergencyProblems(emergencyName, emergencyPhone, phone)
  const emergencyWaits = !emergencyName.trim()
    ? 'Enter their name: everybody needs somebody we can ring.'
    : !emergencyRelation
      ? 'Choose who they are to you.'
      : !emergencyPhone.trim()
        ? 'Enter their phone number: everybody needs somebody we can ring.'
        : (emergencyBad.name ?? emergencyBad.phone ?? null)

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
    const emergency = emergencyWaits
      ? savedEmergency.current
      : { name: emergencyName, relation: emergencyRelation, phone: emergencyPhone }
    const core = coreOf(firstName, lastName, phone, dob, maritalStatus, anniversary, emergency)
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
      savedEmergency.current = emergency
      showToast('Profile saved')
      refreshProfile()
    }, 900)
    return () => window.clearTimeout(timer)
  }, [profileId, firstName, lastName, phone, dob, maritalStatus, anniversary, emergencyName, emergencyRelation, emergencyPhone, emergencyWaits, refreshProfile, errorText])

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
          <PhoneField value={profile.phone ?? ''} onChange={setPhone} />
        </div>
      </SectionTile>

      {/* Red, as Erase Data is (the Owner's ask, November 2026): the one card
          on the page that is about something going wrong, and the one to
          find at a glance when it has. */}
      <SectionTile
        tone="danger"
        title="In an emergency"
        hint="Somebody we can ring if something happens to you at church. Only you and the Owner can see these."
      >
        <div className="flex flex-col gap-4">
          <label className={labelClasses}>
            Their name
            <input
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              maxLength={EMERGENCY_NAME_LIMIT}
              autoComplete="off"
              aria-invalid={emergencyWaits ? true : undefined}
              aria-describedby={emergencyWaits ? 'profile-emergency-waits' : undefined}
              className={inputClasses}
            />
          </label>
          <label className={labelClasses}>
            Who they are to you
            <Select
              value={emergencyRelation}
              onChange={setEmergencyRelation}
              placeholder="Choose one"
              aria-label="Who they are to you"
              options={EMERGENCY_RELATIONS.map((r) => ({ value: r.value, label: r.label }))}
            />
          </label>
          <PhoneField
            label="Their phone number"
            countryLabel="Country code of their number"
            autoComplete="off"
            value={profile.emergency_contact_phone ?? ''}
            onChange={setEmergencyPhone}
          />
          {emergencyWaits && (
            <p id="profile-emergency-waits" role="status" className="text-label-sm text-error">
              {emergencyWaits} Not saved yet.
            </p>
          )}
        </div>
      </SectionTile>

      <SectionTile title="Dates we celebrate" hint="Your birthday and anniversary are shown to everyone on the Celebrations page; your marital status is not. Leave out what doesn’t apply.">
        <div className="flex flex-col gap-4">
          <label className={labelClasses}>
            Date of birth
            <DateField value={dob} onChange={setDob} label="Date of birth" max={todayIso()} clearable />
            <AgeNote dob={dob} />
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
                <VisaNoteField
                  value={sensitive.visa_note ?? ''}
                  onChange={(next) => setSensitive({ ...sensitive, visa_note: next })}
                  labelClassName={labelClasses}
                />
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
