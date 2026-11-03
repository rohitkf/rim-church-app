/*
 * An address, placed on the map (0244): OpenStreetMap's Nominatim, asked
 * once from the browser when the person types an address and presses
 * "Find on map". Their own connection, their own request, so Nominatim's
 * refusal of shared cloud addresses (the clock-in's trouble, 0230) does
 * not apply. Nominatim asks for no more than one request a second and an
 * identifiable caller; the browser sends the page as the Referer.
 */

export interface Found {
  latitude: number
  longitude: number
  /** How Nominatim names the place, to confirm it found the right one. */
  label: string
}

export async function geocodeAddress(
  address: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<Found | null> {
  const q = address.trim()
  if (!q) return null
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`
  const res = await fetcher(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`The map service answered ${res.status}.`)
  const rows = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[]
  const first = rows[0]
  if (!first || !first.lat || !first.lon) return null
  const latitude = Number(first.lat)
  const longitude = Number(first.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude, label: first.display_name ?? q }
}

/**
 * Places that match what has been typed so far, for a list to pick from
 * (0247). The same search, a handful of answers; the caller debounces, so
 * Nominatim's one-a-second is kept, and passes a signal to drop a stale
 * answer when the next keystroke has already asked again.
 */
export async function suggestAddresses(
  text: string,
  fetcher: typeof fetch = (...args) => fetch(...args),
  signal?: AbortSignal,
): Promise<Found[]> {
  const q = text.trim()
  if (q.length < 4) return []
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`
  const res = await fetcher(url, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) throw new Error(`The map service answered ${res.status}.`)
  const rows = (await res.json()) as { lat?: string; lon?: string; display_name?: string }[]
  const out: Found[] = []
  for (const r of rows) {
    const latitude = Number(r.lat)
    const longitude = Number(r.lon)
    if (!r.display_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    out.push({ latitude, longitude, label: r.display_name })
  }
  return out
}
