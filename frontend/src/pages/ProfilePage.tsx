import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'

interface SensitiveProfile {
  visa_type: string | null
  has_dbs: boolean
  visa_expiry: string | null
}

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
    return <p className="text-sm text-neutral-500">Loading profile…</p>
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
      <h1 className="mb-6 text-2xl font-semibold">My profile</h1>
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            First name
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Last name
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            disabled
            value={profile.email}
            className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date of birth
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        {sensitive && (
          <fieldset className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <legend className="px-1 text-xs uppercase tracking-wide text-neutral-500">
              Compliance details (only visible to you and Admin)
            </legend>
            <label className="flex flex-col gap-1 text-sm">
              Visa type
              <input
                value={sensitive.visa_type ?? ''}
                onChange={(e) => setSensitive({ ...sensitive, visa_type: e.target.value || null })}
                className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Visa expiry
              <input
                type="date"
                value={sensitive.visa_expiry ?? ''}
                onChange={(e) => setSensitive({ ...sensitive, visa_expiry: e.target.value || null })}
                className="rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sensitive.has_dbs}
                onChange={(e) => setSensitive({ ...sensitive, has_dbs: e.target.checked })}
              />
              Has valid DBS check
            </label>
          </fieldset>
        )}

        {message && <p className="text-sm text-neutral-500">{message}</p>}
        <button
          type="submit"
          disabled={saving}
          className="self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
