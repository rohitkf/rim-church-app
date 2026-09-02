import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { sensitiveByUserSchema, type SensitiveByUser } from '../lib/types'
import { isMissingColumnError } from '../lib/missingColumn'

const inputClasses =
  'rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none'
const labelClasses = 'flex flex-col gap-1 text-body-sm text-on-surface-variant'

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [anniversary, setAnniversary] = useState('')
  const [sensitive, setSensitive] = useState<SensitiveByUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setFirstName(profile.first_name)
    setLastName(profile.last_name)
    setPhone(profile.phone ?? '')
    setDob(profile.dob ?? '')
    setAnniversary(profile.anniversary ?? '')
  }, [profile])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('profile_sensitive')
      .select('visa_type, has_dbs, visa_expiry')
      .eq('user_id', profile.id)
      .single()
      .then(({ data }) => {
        if (!data) return setSensitive(null)
        const result = sensitiveByUserSchema.safeParse(data)
        if (!result.success) {
          console.error('profile_sensitive response did not match expected shape:', result.error)
          return setSensitive(null)
        }
        setSensitive(result.data)
      })
  }, [profile])

  if (!profile) {
    return <p className="text-body-sm text-on-surface-variant">Loading profile…</p>
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    // Anniversary arrived in a later migration. If the database hasn't had
    // it applied yet, save everything else rather than losing the edit.
    const core = {
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      dob: dob || null,
    }
    const saveProfile = async () => {
      const withAnniversary = await supabase
        .from('profiles')
        .update({ ...core, anniversary: anniversary || null })
        .eq('id', profile!.id)
      if (!isMissingColumnError(withAnniversary.error, 'anniversary')) return withAnniversary
      return supabase.from('profiles').update(core).eq('id', profile!.id)
    }

    const [{ error: profileError }, { error: sensitiveError }] = await Promise.all([
      saveProfile(),
      sensitive
        ? supabase
            .from('profile_sensitive')
            .update({
              visa_type: sensitive.visa_type,
              has_dbs: sensitive.has_dbs,
              visa_expiry: sensitive.visa_expiry,
            })
            .eq('user_id', profile!.id)
        : Promise.resolve({ error: null }),
    ])

    setSaving(false)
    if (profileError || sensitiveError) {
      setMessage((profileError ?? sensitiveError)!.message)
      return
    }
    setMessage('Saved.')
    refreshProfile()
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSave} className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
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
        <label className={labelClasses}>
          Email
          <input disabled value={profile.email} className={`${inputClasses} bg-surface-muted text-on-surface-variant`} />
        </label>
        <label className={labelClasses}>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClasses} />
        </label>
        <label className={labelClasses}>
          Date of birth
          <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={inputClasses} />
        </label>
        <label className={labelClasses}>
          Wedding anniversary
          <input
            type="date"
            value={anniversary}
            onChange={(e) => setAnniversary(e.target.value)}
            className={inputClasses}
          />
          <span className="font-mono text-label-sm text-on-surface-variant">
            Optional — leave it blank if it doesn't apply. Shown to everyone on the Celebrations
            page, like your birthday.
          </span>
        </label>

        {/*
          A section, not a <fieldset>. A legend is laid out inside the box's
          own border, so a phone-width one wraps onto a second line and sits
          on top of the border it was meant to interrupt — which is what made
          this block look broken. A heading above the fields wraps like
          ordinary text and cannot collide with anything.
        */}
        {sensitive && (
          <section className="rounded-[var(--radius-card)] bg-surface-muted p-4 hairline">
            <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              Compliance details
            </h2>
            <p className="mt-1 text-label-md text-on-surface-faint">
              Only you and an Admin can see these.
            </p>

            <div className="mt-4 flex flex-col gap-4">
              <label className={labelClasses}>
                Visa type
                <input
                  value={sensitive.visa_type ?? ''}
                  onChange={(e) => setSensitive({ ...sensitive, visa_type: e.target.value || null })}
                  className={`${inputClasses} bg-surface-lowest`}
                />
              </label>
              <label className={labelClasses}>
                Visa expiry
                <input
                  type="date"
                  value={sensitive.visa_expiry ?? ''}
                  onChange={(e) =>
                    setSensitive({ ...sensitive, visa_expiry: e.target.value || null })
                  }
                  className={`${inputClasses} bg-surface-lowest [color-scheme:dark]`}
                />
              </label>
              {/* `items-start` and a nudged box: with `items-center` a label
                  that wraps to two lines centres the tick against the middle
                  of the paragraph instead of the first line. */}
              <label className="flex items-start gap-2.5 text-body-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={sensitive.has_dbs}
                  onChange={(e) => setSensitive({ ...sensitive, has_dbs: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0">Has a valid DBS check</span>
              </label>
            </div>
          </section>
        )}

        {message && <p className="text-body-sm text-on-surface-variant">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>


    </div>
  )
}
