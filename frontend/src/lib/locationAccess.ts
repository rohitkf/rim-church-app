import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { supabase } from './supabaseClient'
import { detectEnvironment, type Platform } from './installGuide'
import { isStandalone } from './pwa'
import { useLocationPermission, type KnownPermission } from './locationPermission'

/*
 * Who has allowed location on their phone (0228).
 *
 * Every time the app opens, it says what this phone's answer is — allowed,
 * blocked or not known yet — and which kind of phone it is. Settings ›
 * Onboarding lists everybody's, and whoever may send the tour may ask
 * somebody to allow it. Nothing here is a position: only the yes or no.
 */

export const LOCATION_ACCESS_KEY = ['location-access'] as const

export const locationAccessSchema = z.object({
  user_id: z.string(),
  state: z.enum(['granted', 'denied', 'unknown']),
  platform: z.enum(['ios', 'android', 'desktop', 'other']),
  installed: z.boolean(),
  reported_at: z.string().nullable(),
  asked_at: z.string().nullable(),
})
export type LocationAccess = z.infer<typeof locationAccessSchema>

const COLUMNS = 'user_id, state, platform, installed, reported_at, asked_at'

/** Every row the reader may see: their own, and whoever they may send the tour to. */
export async function fetchEveryonesLocationAccess(): Promise<LocationAccess[]> {
  const { data, error } = await supabase.from('location_access').select(COLUMNS)
  if (error) throw error
  return z.array(locationAccessSchema).parse(data ?? [])
}

export async function reportLocationAccess(state: KnownPermission, platform: Platform, installed: boolean) {
  const { error } = await supabase.rpc('report_location_access', {
    p_state: state,
    p_platform: platform,
    p_installed: installed,
  })
  if (error) throw error
}

/** Ask these people to allow location — or, when null, everybody not yet allowing it. Returns how many. */
export async function promptLocation(userIds: string[] | null): Promise<number> {
  const { data, error } = await supabase.rpc('prompt_location', { p_users: userIds })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** Where somebody stands, for the list. */
export type AccessStatus =
  | { kind: 'allowed'; at: string | null }
  | { kind: 'blocked'; at: string | null }
  | { kind: 'not_yet'; at: string | null }
  | { kind: 'never_opened' }

export function accessStatusOf(row: Pick<LocationAccess, 'state' | 'reported_at'> | undefined): AccessStatus {
  if (!row || !row.reported_at) return { kind: 'never_opened' }
  if (row.state === 'granted') return { kind: 'allowed', at: row.reported_at }
  if (row.state === 'denied') return { kind: 'blocked', at: row.reported_at }
  return { kind: 'not_yet', at: row.reported_at }
}

export const PLATFORM_LABEL: Record<LocationAccess['platform'], string> = {
  ios: 'iPhone',
  android: 'Android',
  desktop: 'Computer',
  other: 'Phone',
}

/** How to allow it, step by step, for each kind of phone. */
export const ALLOW_STEPS: Record<'ios' | 'android', { title: string; steps: string[] }> = {
  ios: {
    title: 'On an iPhone',
    steps: [
      'Open the Settings app.',
      'Privacy & Security › Location Services, and make sure it is on.',
      'Scroll down to Safari Websites — or to this app, if you added it to your Home Screen — and choose While Using the App.',
      'Turn Precise Location on.',
      'Come back here and press Allow location.',
    ],
  },
  android: {
    title: 'On Android',
    steps: [
      'In Chrome, tap the icon to the left of the address — or, in the installed app, open Settings › Apps › this app.',
      'Permissions › Location › Allow.',
      'Make sure the phone’s own Location is on: swipe down from the top of the screen and tap Location.',
      'Come back here and press Allow location.',
    ],
  },
}

/**
 * What this phone believes, as best it can tell: what a request for a
 * position actually did, else the browser's word. On an iPhone the
 * browser's "denied" is not believed (lib/locationPermission); elsewhere it
 * is right, so a blocked Android phone shows as blocked without anybody
 * opening the Dashboard first.
 */
function useBestKnown(platform: Platform): KnownPermission {
  const known = useLocationPermission()
  const [fromBrowser, setFromBrowser] = useState<KnownPermission>('unknown')
  useEffect(() => {
    if (platform === 'ios') return
    let cancelled = false
    try {
      void navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((status) => {
          if (cancelled) return
          const read = () =>
            setFromBrowser(status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'unknown')
          read()
          status.onchange = read
        })
        .catch(() => undefined)
    } catch {
      // No Permissions API: what a request does is the only answer.
    }
    return () => {
      cancelled = true
    }
  }, [platform])
  return known !== 'unknown' ? known : fromBrowser
}

/**
 * Tells the database this phone's answer, once it has one worth saying and
 * again whenever it changes. Mounted once, in the app's shell.
 */
export function useReportLocationAccess(signedIn: boolean) {
  const platform = detectEnvironment().platform
  const state = useBestKnown(platform)
  const said = useRef<string | null>(null)

  useEffect(() => {
    if (!signedIn) {
      said.current = null
      return
    }
    const installed = isStandalone()
    const key = `${state}:${platform}:${installed}`
    if (said.current === key) return
    // "Not known yet" waits a moment: the Dashboard's own reading usually
    // answers within a second or two, and one row write beats two.
    const wait = state === 'unknown' ? 4_000 : 0
    const timer = window.setTimeout(() => {
      said.current = key
      reportLocationAccess(state, platform, installed).catch(() => {
        said.current = null
      })
    }, wait)
    return () => window.clearTimeout(timer)
  }, [signedIn, state, platform])
}
