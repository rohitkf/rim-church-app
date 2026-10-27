import { z } from 'zod'
import { supabase } from './supabaseClient'
import { offsetAt } from './availabilityDeadline'

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
  /** Lookups tried; after three it is given up on (0192). */
  address_tries: z.number().optional(),
  person: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
})
export type ClockIn = z.infer<typeof clockInSchema>

/** A day's clock-ins, earliest first. */
export async function fetchClockIns(onDate: string): Promise<ClockIn[]> {
  const { data, error } = await supabase
    .from('clock_ins')
    .select(
      'id, user_id, on_date, clocked_at, method, latitude, longitude, accuracy_m, distance_m, address, address_tries, person:profiles!clock_ins_user_id_fkey(first_name, last_name)',
    )
    .eq('on_date', onDate)
    .order('clocked_at')
  if (error) throw error
  return z.array(clockInSchema).parse(data)
}

// ---------------------------------------------------------------------------
// Clocking in (0192)
// ---------------------------------------------------------------------------

export const myClockInSchema = z.object({
  due: z.boolean(),
  on_date: z.string().optional(),
  first_call: z.string().nullable().optional(),
  opens_at: z.string().nullable().optional(),
  closes_at: z.string().nullable().optional(),
  place_set: z.boolean().optional(),
  accuracy_m: z.number().optional(),
  radius_m: z.number().optional(),
  clocked_at: z.string().nullable().optional(),
  method: z.enum(['location', 'request', 'added']).nullable().optional(),
})
export type MyClockIn = z.infer<typeof myClockInSchema>

export const MY_CLOCK_IN_KEY = ['my-clock-in'] as const

/** Whether the signed-in person clocks in today, from when until when, and whether they have. */
export async function fetchMyClockIn(): Promise<MyClockIn> {
  const { data, error } = await supabase.rpc('my_clock_in_today')
  if (error) throw error
  return myClockInSchema.parse(data)
}

export type ClockInPhase = 'none' | 'early' | 'open' | 'closed' | 'done'

/**
 * Where the day stands for this person: nothing to do, not yet, the
 * button, too late, or done. The button shows only while it is `open`.
 */
export function clockInPhase(today: MyClockIn | undefined, now: number): ClockInPhase {
  if (!today || !today.due) return 'none'
  if (today.clocked_at) return 'done'
  if (today.opens_at && now < Date.parse(today.opens_at)) return 'early'
  if (today.closes_at && now >= Date.parse(today.closes_at)) return 'closed'
  return 'open'
}

export interface Reading {
  lat: number
  lng: number
  /** Metres, as the phone reports it: the true spot is probably within this. */
  accuracy: number
  at: number
}

/** The reading to keep: the one the phone is surest of. */
export function betterReading(kept: Reading | null, next: Reading): Reading {
  if (!kept) return next
  return next.accuracy < kept.accuracy ? next : kept
}

export const clockInResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    clocked_at: z.string(),
    distance_m: z.number(),
    marked: z.number(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(['already', 'not_due', 'not_yet', 'closed', 'no_place', 'too_rough', 'too_far']),
    clocked_at: z.string().optional(),
    opens_at: z.string().optional(),
    accuracy_m: z.number().optional(),
    needed_m: z.number().optional(),
    distance_m: z.number().optional(),
    radius_m: z.number().optional(),
  }),
])
export type ClockInResult = z.infer<typeof clockInResultSchema>
export type ClockInRefusal = Extract<ClockInResult, { ok: false }>

/** The phone's reading, to the database, which decides. */
export async function submitClockIn(reading: Reading): Promise<ClockInResult> {
  const { data, error } = await supabase.rpc('clock_in', {
    lat: reading.lat,
    lng: reading.lng,
    accuracy: reading.accuracy,
  })
  if (error) throw error
  return clockInResultSchema.parse(data)
}

export function churchClock(iso: string, timeZone = 'Europe/London'): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
}

/** Why it said no, in words, and what to try. */
export function refusalWords(refusal: ClockInRefusal, timeZone?: string): { title: string; tips: string[] } {
  switch (refusal.reason) {
    case 'already':
      return { title: 'You have already clocked in today.', tips: [] }
    case 'not_due':
      return { title: 'You are not on today’s rota, so there is nothing to clock in for.', tips: [] }
    case 'not_yet':
      return {
        title: refusal.opens_at ? `Clocking in opens at ${churchClock(refusal.opens_at, timeZone)}.` : 'Clocking in is not open yet.',
        tips: [],
      }
    case 'closed':
      return { title: 'Clocking in has closed for today — the last service has ended.', tips: [] }
    case 'no_place':
      return {
        title: 'Clocking in is not set up yet — the church’s location has not been saved.',
        tips: ['Tell an Admin; they set it at the top of the Clock In page.'],
      }
    case 'too_rough':
      return {
        title: `Your phone is only sure of where you are to ± ${Math.round(refusal.accuracy_m ?? 0)} m; it needs to be within ± ${refusal.needed_m ?? 0} m.`,
        tips: [
          'Step outside or near a window for a few seconds, then try again.',
          'Turn on Wi-Fi (you do not need to connect to anything) — it sharpens the position indoors.',
          'On iPhone: Settings › Privacy & Security › Location Services › your browser › turn on Precise Location.',
          'On Android: turn on Google Location Accuracy in Settings › Location.',
        ],
      }
    case 'too_far':
      return {
        title: `You look to be ${formatDistance(refusal.distance_m ?? 0)} from church; you need to be within ${refusal.radius_m ?? 0} m.`,
        tips: [
          'If you are at church, step outside or near a window and try again — indoors a phone can place itself on the wrong street.',
          'Turn on Wi-Fi and, on iPhone, Precise Location for your browser.',
        ],
      }
  }
}

/** Ask for the street addresses of new clock-ins; best effort, nobody waits on it. */
export function lookUpAddresses(): void {
  void supabase.functions.invoke('clock-in-address', { body: {} }).catch(() => undefined)
}

// ---------------------------------------------------------------------------
// Putting it right (0192): the Owner and Admins
// ---------------------------------------------------------------------------

/** "09:41" on `onDate`, read on the church's clock, as an instant. */
export function churchInstant(onDate: string, hhmm: string, timeZone = 'Europe/London'): Date {
  const [year, month, day] = onDate.split('-').map(Number)
  const [hours, minutes] = hhmm.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hours, minutes)
  const guess = wall - offsetAt(new Date(wall), timeZone)
  return new Date(wall - offsetAt(new Date(guess), timeZone))
}

export async function changeClockInTime(id: string, at: Date, note: string) {
  const { error } = await supabase.rpc('clock_in_set_time', {
    clock_in_id: id,
    new_at: at.toISOString(),
    note: note.trim() || null,
  })
  if (error) throw error
}

export async function addClockIn(personId: string, at: Date, note: string) {
  const { error } = await supabase.rpc('clock_in_add', {
    person: personId,
    at: at.toISOString(),
    note: note.trim() || null,
  })
  if (error) throw error
}

export async function removeClockIn(id: string, note: string) {
  const { error } = await supabase.rpc('clock_in_remove', { clock_in_id: id, note: note.trim() || null })
  if (error) throw error
}

export const clockInHistorySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  on_date: z.string(),
  kind: z.enum(['clocked_in', 'approved', 'added', 'changed', 'removed']),
  clocked_at: z.string().nullable(),
  previous_at: z.string().nullable(),
  note: z.string().nullable(),
  changed_by: z.string().nullable(),
  changed_at: z.string(),
  person: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
  changer: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
})
export type ClockInHistoryEntry = z.infer<typeof clockInHistorySchema>

/** Everything that happened to a day's clock-ins, newest first. */
export async function fetchClockInHistory(onDate: string): Promise<ClockInHistoryEntry[]> {
  const { data, error } = await supabase
    .from('clock_in_history')
    .select(
      'id, user_id, on_date, kind, clocked_at, previous_at, note, changed_by, changed_at, person:profiles!clock_in_history_user_id_fkey(first_name, last_name), changer:profiles!clock_in_history_changed_by_fkey(first_name, last_name)',
    )
    .eq('on_date', onDate)
    .order('changed_at', { ascending: false })
  if (error) throw error
  return z.array(clockInHistorySchema).parse(data)
}

/** Which teams each person who clocked in on `onDate` was on that day (0193). */
export async function fetchClockInTeams(onDate: string): Promise<{ user_id: string; department_id: string }[]> {
  const { data, error } = await supabase.rpc('clock_in_day_teams', { on_day: onDate })
  if (error) throw error
  return z.array(z.object({ user_id: z.string(), department_id: z.string() })).parse(data ?? [])
}

export interface ClockInGroup {
  /** The team, or null for those on no team's rota that day. */
  teamId: string | null
  name: string
  rows: ClockIn[]
}

/**
 * The day's clock-ins team by team, teams in name order. Somebody on two
 * teams is under both; somebody an Admin added who was on no rota comes
 * last, under "Not on the rota".
 */
export function groupClockIns(
  rows: readonly ClockIn[],
  teams: readonly { user_id: string; department_id: string }[],
  teamName: (id: string) => string | null,
): ClockInGroup[] {
  const groups = new Map<string, ClockIn[]>()
  const placed = new Set<string>()
  for (const row of rows) {
    for (const t of teams) {
      if (t.user_id !== row.user_id || !teamName(t.department_id)) continue
      groups.set(t.department_id, [...(groups.get(t.department_id) ?? []), row])
      placed.add(row.id)
    }
  }
  const out: ClockInGroup[] = [...groups.entries()]
    .map(([teamId, list]) => ({ teamId, name: teamName(teamId)!, rows: list }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const elsewhere = rows.filter((r) => !placed.has(r.id))
  if (elsewhere.length > 0) out.push({ teamId: null, name: 'Not on the rota', rows: elsewhere })
  return out
}
