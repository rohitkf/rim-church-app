import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import {
  notificationsSupported,
  permissionState,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush,
  type PushPermission,
} from '../lib/push'
import { isIos, isStandalone } from '../lib/pwa'

/**
 * Whether this device is registered to be reached while the app is shut.
 *
 * Separate from the browser's permission, which is the mistake this
 * component previously made: permission and a push subscription are two
 * different things, and a device can hold the first without the second for
 * a long time without anything looking wrong.
 */
type PushState = 'unknown' | 'registered' | 'in-app-only' | 'failed'

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
  const [push, setPush] = useState<PushState>('unknown')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Remember this browser so the server can reach it while the app is shut.
   *
   * Safe to call as often as we like: the browser hands back the
   * subscription it already has rather than minting a second one, and the
   * write is an upsert keyed on the endpoint.
   */
  const saveSubscription = useCallback(async () => {
    if (!session?.user.id) return
    const subscription = await subscribeToPush()
    // No key in this build, or a browser without PushManager. Permission
    // still buys in-app notifications, which is worth saying accurately
    // rather than calling the whole thing on.
    if (!subscription?.endpoint) {
      setPush('in-app-only')
      return
    }
    const { error: saveError } = await supabase.rpc('register_push_device', {
      p_endpoint: subscription.endpoint,
      p_p256dh: subscription.keys?.p256dh ?? '',
      p_auth: subscription.keys?.auth ?? '',
    })
    if (saveError) throw saveError
    setPush('registered')
  }, [session?.user.id])

  /**
   * Catch up a device that granted permission before there was any push to
   * grant it for.
   *
   * Everybody who used the notification bell before push existed is in
   * exactly that position: permission granted, no subscription, and — until
   * this ran — no button either, because the button only ever appeared
   * while permission was still undecided. Their phones would have stayed
   * silent for ever with the panel cheerfully reporting notifications were
   * on. The same path re-registers a device whose subscription the browser
   * has since dropped, which it does on its own schedule.
   */
  useEffect(() => {
    if (state !== 'granted' || !session?.user.id) return
    let cancelled = false
    void (async () => {
      try {
        await saveSubscription()
      } catch {
        if (!cancelled) setPush('failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [state, session?.user.id, saveSubscription])

  const turnOn = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await requestPermission()
      setState(next)
      if (next === 'granted') await saveSubscription()
    } catch {
      // Permission is still granted for in-app notifications even if
      // registering for push failed, so say what didn't work rather than
      // pretending the whole thing did.
      setPush('failed')
      setError("Notifications are on, but this device couldn't register for alerts while the app is closed.")
    } finally {
      setBusy(false)
    }
  }

  const retry = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveSubscription()
    } catch {
      setPush('failed')
      setError("Still couldn't register this device. A reload usually clears it.")
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      const endpoint = await unsubscribeFromPush()
      if (endpoint) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      setPush('in-app-only')
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
    // Only one of these is the full thing. Saying so is the whole point:
    // "on for this device" over a device that cannot be reached while shut
    // is the failure that hid here in the first place.
    const said =
      push === 'registered'
        ? 'Notifications are on for this device.'
        : push === 'failed'
          ? 'Notifications are on here, but not while the app is closed.'
          : push === 'in-app-only'
            ? 'Notifications are on while the app is open.'
            : 'Notifications are on. Checking this device…'

    return (
      <div className={wrap}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-on-surface-variant">{said}</span>
          <button
            type="button"
            onClick={push === 'failed' ? retry : turnOff}
            disabled={busy}
            className="shrink-0 text-on-surface-variant transition-colors hover:text-on-surface disabled:opacity-50"
          >
            {push === 'failed' ? 'Try again' : 'Turn off'}
          </button>
        </div>
        {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
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
