import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

interface SensitiveProfile {
  visa_type: string | null
  has_dbs: boolean
  visa_expiry: string | null
}

const inputClasses =
  'rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none'
const labelClasses = 'flex flex-col gap-1 text-body-sm text-on-surface-variant'

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [sensitive, setSensitive] = useState<SensitiveProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setFirstName(profile.first_name)
    setLastName(profile.last_name)
    setPhone(profile.phone ?? '')
    setDob(profile.dob ?? '')
  }, [profile])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('profile_sensitive')
      .select('visa_type, has_dbs, visa_expiry')
      .eq('user_id', profile.id)
      .single()
      .then(({ data }) => setSensitive(data))
  }, [profile])

  if (!profile) {
    return <p className="text-body-sm text-on-surface-variant">Loading profile…</p>
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const [{ error: profileError }, { error: sensitiveError }] = await Promise.all([
      supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          dob: dob || null,
        })
        .eq('id', profile!.id),
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
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-headline-lg">My profile</h1>
      <form onSubmit={handleSave} className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-lowest p-6">
        <div className="flex gap-3">
          <label className={`flex-1 ${labelClasses}`}>
            First name
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClasses} />
          </label>
          <label className={`flex-1 ${labelClasses}`}>
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

        {sensitive && (
          <fieldset className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4">
            <legend className="px-1 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              Compliance details — only visible to you and Admin
            </legend>
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
                onChange={(e) => setSensitive({ ...sensitive, visa_expiry: e.target.value || null })}
                className={`${inputClasses} bg-surface-lowest`}
              />
            </label>
            <label className="flex items-center gap-2 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={sensitive.has_dbs}
                onChange={(e) => setSensitive({ ...sensitive, has_dbs: e.target.checked })}
              />
              Has valid DBS check
            </label>
          </fieldset>
        )}

        {message && <p className="text-body-sm text-on-surface-variant">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
