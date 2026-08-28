import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import {
  notificationsSupported,
  permissionState,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush,
  webPushSupported,
  type PushPermission,
} from '../lib/push'
import { isIos, isStandalone } from '../lib/pwa'

/**
 * The one row at the foot of the notifications panel that turns phone
 * notifications on.
 *
 * It lives here rather than in a settings page because this is where
 * someone is when they think about notifications, and it only ever appears
 * when there is something to say: a browser that cannot do it at all, or a
 * permission that has been refused and can only be undone in the browser's
 * own settings, gets a sentence instead of a button that would lie.
 */
export function PushPermissionRow() {
  const { session } = useAuth()
  // Read once at mount: the browser's permission cannot change under us
  // without a click that goes through this component.
  const [state, setState] = useState<PushPermission>(permissionState)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Remember this browser so the server can reach it while the app is shut. */
  const saveSubscription = async () => {
    const subscription = await subscribeToPush()
    if (!subscription?.endpoint || !session?.user.id) return
    const { error: saveError } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: session.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh ?? '',
        auth: subscription.keys?.auth ?? '',
      },
      { onConflict: 'endpoint' },
    )
    if (saveError) throw saveError
  }

  const turnOn = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await requestPermission()
      setState(next)
      if (next === 'granted' && webPushSupported()) await saveSubscription()
    } catch {
      // Permission is still granted for in-app notifications even if
      // registering for push failed, so say what didn't work rather than
      // pretending the whole thing did.
      setError("Notifications are on, but this device couldn't register for alerts while the app is closed.")
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      const endpoint = await unsubscribeFromPush()
      if (endpoint) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      setState(permissionState())
    } finally {
      setBusy(false)
    }
  }

  const wrap = 'border-t border-border-subtle px-4 py-3 text-label-md'

  // iOS only allows this at all once the app is on the home screen, so
  // saying how to install is the only useful thing there.
  if (isIos() && !isStandalone()) {
    return (
      <div className={`${wrap} text-on-surface-variant`}>
        Add RIM to your Home Screen to get notifications on this phone.
      </div>
    )
  }

  if (!notificationsSupported() || state === 'unsupported') return null

  if (state === 'denied') {
    return (
      <div className={`${wrap} text-on-surface-variant`}>
        Notifications are blocked for this site. Your browser&rsquo;s site settings can undo that.
      </div>
    )
  }

  if (state === 'granted') {
    return (
      <div className={`${wrap} flex items-center justify-between gap-3`}>
        <span className="text-on-surface-variant">Notifications are on for this device.</span>
        <button
          type="button"
          onClick={turnOff}
          disabled={busy}
          className="shrink-0 text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
        >
          Turn off
        </button>
      </div>
    )
  }

  return (
    <div className={wrap}>
      <button
        type="button"
        onClick={turnOn}
        disabled={busy}
        className="w-full rounded-full bg-primary px-4 py-2 text-label-md font-medium text-on-primary transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? 'Just a moment…' : 'Turn on notifications'}
      </button>
      {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
    </div>
  )
}
