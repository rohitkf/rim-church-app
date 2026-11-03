import { detectEnvironment, type Platform } from './installGuide'

/*
 * "Open directions" (0244): the phone's own maps app, pointed at the
 * event. An iPhone opens Apple Maps from a maps.apple.com link; anything
 * else gets Google Maps, which Android hands to its app and a computer
 * opens in a tab. Coordinates when the pin is set, else the address as
 * typed, so the button works for an event nobody put on the map.
 */

export interface Place {
  latitude?: number | null
  longitude?: number | null
  address?: string | null
  name?: string | null
}

export function directionsUrl(place: Place, platform: Platform = detectEnvironment().platform): string | null {
  const hasPin = typeof place.latitude === 'number' && typeof place.longitude === 'number'
  const where = hasPin ? `${place.latitude},${place.longitude}` : [place.name, place.address].filter(Boolean).join(', ').trim()
  if (!where) return null
  const q = encodeURIComponent(where)
  return platform === 'ios' ? `https://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`
}
