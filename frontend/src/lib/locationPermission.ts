import { useEffect, useSyncExternalStore } from 'react'

/**
 * Whether this phone lets the app read its location — as the phone showed
 * it, not as the browser says.
 *
 * The Permissions API is the obvious question to ask, and on an iPhone it
 * answers wrongly: Safari, and the app installed to the home screen, can
 * say "denied" for a site whose every request for a position succeeds. So
 * the Dashboard said "Location is blocked" right under a dot that had just
 * found the phone 5 km from church. The only answer to trust is what a
 * request actually did, so every place that asks for a position reports
 * here, and the screens read it. The browser is still asked, but only a
 * "granted" from it is believed.
 */
export type KnownPermission = 'granted' | 'denied' | 'unknown'

let current: KnownPermission = 'unknown'
const listeners = new Set<() => void>()

/** What a request for a position just showed. */
export function reportLocation(outcome: 'granted' | 'denied') {
  if (current === outcome) return
  current = outcome
  listeners.forEach((listen) => listen())
}

function subscribe(listen: () => void) {
  listeners.add(listen)
  return () => listeners.delete(listen)
}

export function useLocationPermission(): KnownPermission {
  const known = useSyncExternalStore(subscribe, () => current, () => 'unknown' as const)
  useEffect(() => {
    let cancelled = false
    try {
      void navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((status) => {
          if (!cancelled && status.state === 'granted') reportLocation('granted')
        })
        .catch(() => undefined)
    } catch {
      // No Permissions API: the first request for a position will tell.
    }
    return () => {
      cancelled = true
    }
  }, [])
  return known
}

/** For tests: back to knowing nothing. */
export function forgetLocationPermission() {
  current = 'unknown'
  listeners.forEach((listen) => listen())
}
