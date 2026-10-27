import { betterReading, type Reading } from './clockIn'

/**
 * Where the phone is, as surely as it can say in the time there is.
 *
 * A single `getCurrentPosition` takes the phone's first answer, and the
 * first answer is often its roughest: a mast or a Wi-Fi guess hundreds of
 * metres out, before the satellites have been heard. So this watches
 * instead, asking for the precise position and nothing cached, and keeps
 * whichever reading the phone is surest of. It stops as soon as a reading
 * is plainly good enough, a few seconds after one is only just good enough
 * (the next is often better), or when the time runs out — and then hands
 * over the best it had, for the database to judge.
 */
export class LocationRefused extends Error {
  readonly reason: 'blocked' | 'unsupported' | 'nothing'
  constructor(reason: 'blocked' | 'unsupported' | 'nothing') {
    super(
      reason === 'blocked'
        ? 'Location is blocked for this app.'
        : reason === 'unsupported'
          ? 'This browser cannot tell where it is.'
          : 'Your phone could not find where it is.',
    )
    this.reason = reason
  }
}

export function readBestPosition({
  geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
  neededM,
  totalMs = 20_000,
  settleMs = 3_000,
  onProgress,
}: {
  geolocation?: Geolocation
  /** The database's cap: a reading rougher than this is refused. */
  neededM: number
  totalMs?: number
  /** How long to wait for a better reading once one is just good enough. */
  settleMs?: number
  onProgress?: (latest: Reading, best: Reading) => void
}): { done: Promise<Reading>; cancel: () => void } {
  let cancel = () => {}
  const done = new Promise<Reading>((resolve, reject) => {
    if (!geolocation) {
      reject(new LocationRefused('unsupported'))
      return
    }
    let best: Reading | null = null
    let settle: ReturnType<typeof setTimeout> | null = null
    let finished = false
    // Plainly good enough: well inside the cap, and close enough to the
    // phone's best that waiting would gain nothing worth the wait.
    const sureEnough = Math.min(neededM / 2, 15)

    let watch: number | null = null
    const stop = () => {
      finished = true
      if (watch !== null) geolocation.clearWatch(watch)
      clearTimeout(deadline)
      if (settle) clearTimeout(settle)
    }
    const finish = () => {
      if (finished) return
      stop()
      if (best) resolve(best)
      else reject(new LocationRefused('nothing'))
    }
    cancel = () => {
      if (finished) return
      stop()
      reject(new DOMException('Cancelled', 'AbortError'))
    }

    const deadline = setTimeout(finish, totalMs)
    watch = geolocation.watchPosition(
      (position) => {
        if (finished) return
        const latest: Reading = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          at: position.timestamp,
        }
        best = betterReading(best, latest)
        onProgress?.(latest, best)
        if (best.accuracy <= sureEnough) finish()
        else if (best.accuracy <= neededM && !settle) settle = setTimeout(finish, settleMs)
      },
      (error) => {
        if (finished) return
        if (error.code === error.PERMISSION_DENIED) {
          stop()
          reject(new LocationRefused('blocked'))
        }
        // Timed out or unavailable for now: the watch keeps listening
        // until the time runs out.
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: totalMs },
    )
    // A watch answered at once and already finished: let it go.
    if (finished) geolocation.clearWatch(watch)
  })
  return { done, cancel }
}

export type LocationPermission = 'granted' | 'prompt' | 'denied' | 'unknown'

/**
 * Whether the app may read the location, where the browser will say.
 * Older Safari will not; "unknown" then, and the first clock-in asks.
 */
export async function locationPermission(): Promise<{ state: LocationPermission; status: PermissionStatus | null }> {
  try {
    if (!('permissions' in navigator) || !navigator.permissions?.query) return { state: 'unknown', status: null }
    const status = await navigator.permissions.query({ name: 'geolocation' })
    return { state: status.state, status }
  } catch {
    return { state: 'unknown', status: null }
  }
}
