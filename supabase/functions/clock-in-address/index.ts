/**
 * The street address of each clock-in, looked up once (0192).
 *
 * A clock-in keeps where the phone was. Somebody reading the Clock In page
 * wants "12 High Street", not two numbers, so each position is turned into
 * an address with OpenStreetMap's Nominatim — free and well kept, on two
 * conditions this keeps: no more than one lookup a second across everybody
 * (the database hands out the queue a row at a time, a second apart, so
 * twenty phones clocking in together are looked up one after another), and
 * a request that says who is asking.
 *
 * Anybody signed in may start it — the Dashboard does, straight after a
 * clock-in, and the Clock In page does for anything still waiting — but it
 * only ever works the queue the database gives it, with the service role,
 * and returns nothing but a count.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** As long as one call keeps at it; anything left is picked up by the next. */
const BUDGET_MS = 25_000
const USER_AGENT = 'RIM-Church-App/1.0 (+https://rim-church-app.vercel.app)'

type Place = {
  display_name?: string
  name?: string
  address?: Record<string, string>
}

/** "12 High Street, Caversham, Reading, RG4 8AA" — the parts a person would say. */
export function shortAddress(place: Place): string | null {
  const a = place.address ?? {}
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(' ')
  const first = street || a.building || a.amenity || place.name || ''
  const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? ''
  const town = a.town ?? a.city ?? a.village ?? a.hamlet ?? ''
  const parts = [first, area, town, a.postcode ?? ''].map((p) => p.trim()).filter(Boolean)
  const unique = parts.filter((p, i) => parts.indexOf(p) === i)
  if (unique.length > 0) return unique.join(', ')
  return place.display_name ? place.display_name.split(',').slice(0, 4).join(',').trim() : null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)
  const asCaller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'Not signed in.' }, 401)

  const admin = createClient(url, serviceKey)
  const started = Date.now()
  let looked = 0

  while (Date.now() - started < BUDGET_MS) {
    const { data: next, error } = await admin.rpc('next_clock_in_address')
    if (error) return json({ error: error.message, looked }, 500)
    if (!next) break
    if (typeof next.wait_ms === 'number') {
      await sleep(next.wait_ms)
      continue
    }

    const query = new URLSearchParams({
      format: 'jsonv2',
      lat: String(next.latitude),
      lon: String(next.longitude),
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'en-GB',
    })
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      })
      if (!response.ok) continue // Tried, and counted: it is retried later, up to three times.
      const place = (await response.json()) as Place & { error?: string }
      const address = place.error ? 'No street address here' : shortAddress(place)
      await admin.rpc('set_clock_in_address', { clock_in_id: next.id, found_address: address ?? 'No street address here' })
      looked += 1
    } catch {
      // The network failed; the row waits its two minutes and is tried again.
    }
  }

  return json({ looked })
})
