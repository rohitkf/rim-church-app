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
