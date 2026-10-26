import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * Clock in (0191): the shared pieces.
 *
 * Whoever is on a day's rota presses CLOCK IN when they arrive; their
 * phone reads where it is, once, and the database decides whether that is
 * at church. These are the parts more than one screen needs: who may see
 * the Clock In page, how far apart two points are, and finding the church
 * by postcode or address.
 *
 * Finding uses two free services, both well kept and both used here only
 * by an Owner or Admin setting the church's spot:
 *  - postcodes.io, open data from the Office for National Statistics and
 *    Ordnance Survey, for a UK postcode;
 *  - OpenStreetMap's Nominatim, for a street address. Its terms ask for
 *    no more than one search a second and for the data to be credited;
 *    a search is only sent when somebody presses Find.
 */

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)

/** Teams and people, by id: who besides Admins and Overwatch may see the page. */
export const clockInAudienceSchema = z
  .object({
    teams: z.array(z.unknown()).transform((ids) => ids.filter((id): id is string => uuid.safeParse(id).success)).catch([]).default([]),
    people: z.array(z.unknown()).transform((ids) => ids.filter((id): id is string => uuid.safeParse(id).success)).catch([]).default([]),
  })
  .catch({ teams: [], people: [] })

export type ClockInAudience = z.infer<typeof clockInAudienceSchema>

/**
 * Whether somebody may open the Clock In page — the same answer as the
 * database's `may_see_clock_ins()`, which is what really decides.
 */
export function maySeeClockIns(who: {
  isAdmin: boolean
  isOwner: boolean
  /** Overwatch, with the page left open to it (Settings › Overwatch). */
  watching: boolean
  myId: string | null | undefined
  /** Teams they are on or lead. */
  teamIds: readonly string[]
  viewers: ClockInAudience
}): boolean {
  if (who.isAdmin || who.isOwner || who.watching) return true
  if (who.myId && who.viewers.people.includes(who.myId)) return true
  return who.teamIds.some((id) => who.viewers.teams.includes(id))
}

/** Metres between two points on the Earth — the database works it out the same way. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "40 m", "1.2 km" — near enough to read at a glance, exact enough to trust. */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`
}

export interface FoundPlace {
  label: string
  postcode: string | null
  lat: number
  lng: number
}

/** A UK postcode as people write it, or null when it is not shaped like one. */
export function normalisePostcode(text: string): string | null {
  const squashed = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(squashed)) return null
  return `${squashed.slice(0, -3)} ${squashed.slice(-3)}`
}

const postcodeSchema = z.object({
  result: z.object({
    postcode: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    admin_ward: z.string().nullable().optional(),
    admin_district: z.string().nullable().optional(),
  }),
})

const nominatimSchema = z.array(
  z.object({
    display_name: z.string(),
    lat: z.string(),
    lon: z.string(),
    address: z.object({ postcode: z.string().optional() }).partial().optional(),
  }),
)

/**
 * The church found by a postcode (postcodes.io) or, failing that, by an
 * address (OpenStreetMap). A postcode's point is the middle of its
 * houses, not the church door — the pin is there to be dragged.
 */
export async function findPlaces(query: string, fetcher: typeof fetch = fetch): Promise<FoundPlace[]> {
  const text = query.trim()
  if (!text) return []
  const postcode = normalisePostcode(text)
  if (postcode) {
    const response = await fetcher(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`)
    if (response.status === 404) return []
    if (!response.ok) throw new Error('The postcode finder did not answer. Try again in a moment.')
    const { result } = postcodeSchema.parse(await response.json())
    const area = [result.admin_ward, result.admin_district].filter(Boolean).join(', ')
    return [
      {
        label: area ? `${result.postcode} · ${area}` : result.postcode,
        postcode: result.postcode,
        lat: result.latitude,
        lng: result.longitude,
      },
    ]
  }
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=gb&q=' +
    encodeURIComponent(text)
  const response = await fetcher(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('The address finder did not answer. Try again in a moment.')
  return nominatimSchema.parse(await response.json()).map((hit) => ({
    label: hit.display_name,
    postcode: hit.address?.postcode ? normalisePostcode(hit.address.postcode) : null,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
  }))
}

// ---------------------------------------------------------------------------
// The rows
// ---------------------------------------------------------------------------

export const clockInPlaceSchema = z.object({
  label: z.string().nullable(),
  postcode: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  updated_at: z.string(),
  updater: z.object({ first_name: z.string(), last_name: z.string() }).nullable().optional(),
})
export type ClockInPlace = z.infer<typeof clockInPlaceSchema>

/** Where the church is: an Owner's or Admin's to read (0191). Null until it is set. */
export async function fetchClockInPlace(): Promise<ClockInPlace | null> {
  const { data, error } = await supabase
    .from('clock_in_place')
    .select('label, postcode, latitude, longitude, updated_at, updater:profiles!clock_in_place_updated_by_fkey(first_name, last_name)')
    .maybeSingle()
  if (error) throw error
  return data ? clockInPlaceSchema.parse(data) : null
}

export async function saveClockInPlace(place: { label: string | null; postcode: string | null; lat: number; lng: number }) {
  const { error } = await supabase.from('clock_in_place').upsert({
    id: true,
    label: place.label,
    postcode: place.postcode,
    latitude: place.lat,
    longitude: place.lng,
  })
  if (error) throw error
}

export const clockInSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  on_date: z.string(),
  clocked_at: z.string(),
  method: z.enum(['location', 'request', 'added']),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  accuracy_m: z.number().nullable(),
  distance_m: z.number().nullable(),
  address: z.string().nullable(),
  person: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
})
export type ClockIn = z.infer<typeof clockInSchema>

/** A day's clock-ins, earliest first. */
export async function fetchClockIns(onDate: string): Promise<ClockIn[]> {
  const { data, error } = await supabase
    .from('clock_ins')
    .select(
      'id, user_id, on_date, clocked_at, method, latitude, longitude, accuracy_m, distance_m, address, person:profiles!clock_ins_user_id_fkey(first_name, last_name)',
    )
    .eq('on_date', onDate)
    .order('clocked_at')
  if (error) throw error
  return z.array(clockInSchema).parse(data)
}
