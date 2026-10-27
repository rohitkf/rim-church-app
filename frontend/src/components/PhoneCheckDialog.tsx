import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { isInternational, type PhoneStatus } from '../lib/phone'
import { subscribeTour } from '../lib/tour'
import { Overlay } from './Surface'
import { PhoneField } from './PhoneField'

/**
 * Asks somebody who already has a number saved to say which country it is in.
 *
 * Numbers saved before the app knew about country codes are mostly UK
 * mobiles written "07…". Those are guessed as UK and put in front of the
 * person to confirm or correct; nothing is changed without them pressing
 * Save. Anybody with no number is not asked — that is the form's job, and
 * a prompt for something they never gave would be a new nag, not a fix.
 *
 * "Not now" holds it off for this visit only. It stays out of the way of
 * the tour, and of an Admin previewing the app as somebody else, since
 * saving then would write to the wrong person's idea of themselves.
 */

const SNOOZE_KEY = 'rim.phoneCheck.snoozed'

function snoozed(): boolean {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === '1'
  } catch {
    return false
  }
}

export function PhoneCheckDialog() {
  const { profile, viewAs, refreshProfile } = useAuth()
  const errorText = useErrorText()
  const [touring, setTouring] = useState(false)
  const [hidden, setHidden] = useState(snoozed)
  const [number, setNumber] = useState('')
  const [status, setStatus] = useState<PhoneStatus>('empty')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => subscribeTour((run) => setTouring(run !== null)), [])

  const stored = profile?.phone?.trim() ?? ''
  if (!profile || viewAs || touring || hidden || !stored || isInternational(stored)) return null

  function later() {
    try {
      sessionStorage.setItem(SNOOZE_KEY, '1')
    } catch {
      /* private mode: it will ask again next time, which is fine */
    }
    setHidden(true)
  }

  async function save() {
    if (!profile || status !== 'valid') return
    setSaving(true)
    setError(null)
    const { error: failed } = await supabase.from('profiles').update({ phone: number }).eq('id', profile.id)
    setSaving(false)
    if (failed) {
      setError(errorText(failed, 'Could not save your number.'))
      return
    }
    await refreshProfile()
    showToast('Phone number saved.')
  }

  return (
    <Overlay onDismiss={later} label="Check your phone number">
      <div className="w-full max-w-[420px] rounded-[var(--radius-shell)] bg-surface-lowest p-7 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 sm:p-8 dark:ring-white/12">
        <h2 className="text-headline-md">Check your phone number</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Numbers now carry a country code, so a church with people from many places can ring them.
          Is this right?
        </p>
        <div className="mt-5">
          <PhoneField value={stored} onChange={setNumber} onStatus={setStatus} showError normalise />
        </div>
        {error && (
          <p role="alert" className="mt-3 text-body-sm text-error">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || status !== 'valid'}
            className="rounded-full bg-primary px-5 py-3 text-body-md font-semibold text-on-primary hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save number'}
          </button>
          <button
            type="button"
            onClick={later}
            className="tap text-center text-label-md text-on-surface-faint hover:text-on-surface"
          >
            Not now
          </button>
        </div>
      </div>
    </Overlay>
  )
}
