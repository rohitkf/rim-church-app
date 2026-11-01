import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { supabase } from './supabaseClient'
import { reportLocation } from './locationPermission'

/**
 * Am I at church? (0195)
 *
 * Read when the app opens, and again when it comes back to the front after
 * a couple of minutes away — never in the background. The database weighs
 * the reading and answers in, out or not sure, with a rounded distance; it
 * keeps nothing, and the church's pin stays the Owner's and Admins'.
 */

export const whereAmISchema = z.object({
  state: z.enum(['in', 'out', 'unsure', 'no_place']),
  distance_m: z.number().optional(),
  radius_m: z.number().optional(),
  accuracy_m: z.number().optional(),
  needed_m: z.number().optional(),
})
export type WhereAmI = z.infer<typeof whereAmISchema>

export async function askWhereAmI(lat: number, lng: number, accuracy: number): Promise<WhereAmI> {
  const { data, error } = await supabase.rpc('clock_in_where_am_i', { lat, lng, accuracy })
  if (error) throw error
  return whereAmISchema.parse(data)
}

export type WhereAmIStatus =
  | { at: 'checking' }
  | { at: 'answered'; answer: WhereAmI; checkedAt: number }
  | { at: 'blocked' }
  | { at: 'unavailable' }
  | { at: 'failed' }

/** Coming back to the app after this long reads the phone again. */
const STALE_MS = 2 * 60_000

/**
 * The dot's state. Reading the phone on open asks for location the first
 * time, as the church chose; after that the browser remembers the answer.
 */
export function useWhereAmI(enabled: boolean) {
  const [status, setStatus] = useState<WhereAmIStatus>(() =>
    typeof navigator === 'undefined' || !navigator.geolocation ? { at: 'unavailable' } : { at: 'checking' },
  )
  const lastRef = useRef(0)
  const busyRef = useRef(false)

  // Reads the phone and asks; every state it sets is set when an answer
  // comes back, so an effect can start it.
  const read = useCallback((fresh: boolean) => {
    if (busyRef.current || typeof navigator === 'undefined' || !navigator.geolocation) return
    busyRef.current = true
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        reportLocation('granted')
        try {
          const answer = await askWhereAmI(position.coords.latitude, position.coords.longitude, position.coords.accuracy)
          lastRef.current = Date.now()
          setStatus({ at: 'answered', answer, checkedAt: lastRef.current })
        } catch {
          setStatus({ at: 'failed' })
        } finally {
          busyRef.current = false
        }
      },
      (err) => {
        busyRef.current = false
        if (err.code === err.PERMISSION_DENIED) reportLocation('denied')
        setStatus(err.code === err.PERMISSION_DENIED ? { at: 'blocked' } : { at: 'unavailable' })
      },
      // A reading a minute old is fine for a dot; "Check again" asks for a new one.
      { enableHighAccuracy: true, maximumAge: fresh ? 0 : 60_000, timeout: 15_000 },
    )
  }, [])

  useEffect(() => {
    if (!enabled) return
    read(false)
    const onShow = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRef.current > STALE_MS) read(false)
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [enabled, read])

  return {
    status,
    /** A fresh reading, asked for by a tap. */
    check: () => {
      if (busyRef.current) return
      setStatus({ at: 'checking' })
      read(true)
    },
  }
}

export interface WhereAmIWords {
  tone: 'green' | 'red' | 'grey'
  /** Beside the dot, always. */
  label: string
  /** Behind a tap: how far, how sure, and what to do about it. */
  detail: string | null
}

function distance(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

export function whereAmIWords(status: WhereAmIStatus): WhereAmIWords {
  switch (status.at) {
    case 'checking':
      return { tone: 'grey', label: 'Finding you…', detail: null }
    case 'blocked':
      return {
        tone: 'grey',
        label: 'Location blocked',
        detail: 'Press Allow location and choose Allow when your phone asks. If it does not ask, the steps show how to allow it in your phone’s settings.',
      }
    case 'unavailable':
      return { tone: 'grey', label: 'Location unknown', detail: 'Your phone could not find where it is. Check Location is on, then check again.' }
    case 'failed':
      return { tone: 'grey', label: 'Location unknown', detail: 'Could not check just now. Try again in a moment.' }
    case 'answered': {
      const a = status.answer
      if (a.state === 'no_place') {
        return { tone: 'grey', label: 'Church location not set', detail: 'An Admin sets it at the top of the Clock In page.' }
      }
      const how = `${distance(a.distance_m ?? 0)} from church · ± ${a.accuracy_m ?? 0} m`
      if (a.state === 'in') return { tone: 'green', label: 'At church', detail: `${how}. CLOCK IN will work here.` }
      if (a.state === 'out') {
        return { tone: 'red', label: 'Not at church', detail: `${how}. You need to be within ${a.radius_m ?? 100} m to clock in.` }
      }
      return {
        tone: 'grey',
        label: 'Can’t tell yet',
        detail: `${how}. Your phone needs to be sure to ± ${a.needed_m ?? 50} m — step outside or near a window and check again.`,
      }
    }
  }
}
