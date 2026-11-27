import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: { rpc: vi.fn() } }))

import { estimateFromHere, estimateWords } from './onMyWayEstimate'

const phoneAt = (lat: number, lng: number, accuracy = 800) =>
  ({
    getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: lat, longitude: lng, accuracy } } as GeolocationPosition),
  }) as Pick<Geolocation, 'getCurrentPosition'>
const phoneRefusing = (code: number) =>
  ({
    getCurrentPosition: (_ok: PositionCallback, no?: PositionErrorCallback | null) => no?.({ code, PERMISSION_DENIED: 1 } as GeolocationPositionError),
  }) as Pick<Geolocation, 'getCurrentPosition'>

describe('an estimate from where the phone is', () => {
  it('asks the phone once, roughly, and turns the distance that comes back into minutes', async () => {
    const read = vi.fn((ok: PositionCallback, _no?: PositionErrorCallback | null, _how?: PositionOptions) => ok({ coords: { latitude: 51.5, longitude: -0.1, accuracy: 900 } } as GeolocationPosition))
    const ask = vi.fn().mockResolvedValue({ state: 'out', distance_m: 5000 })
    expect(await estimateFromHere({ geolocation: { getCurrentPosition: read }, ask })).toEqual({ at: 'away', distanceM: 5000, minutes: 20 })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false })
    expect(ask).toHaveBeenCalledWith(51.5, -0.1, 900)
  })

  it('says so when they are there already', async () => {
    expect(await estimateFromHere({ geolocation: phoneAt(51.5, -0.1), ask: () => Promise.resolve({ state: 'in', distance_m: 30 }) })).toEqual({ at: 'church' })
  })

  it('counts a phone that is not sure enough to clock in as away by what it reads', async () => {
    expect(await estimateFromHere({ geolocation: phoneAt(51.5, -0.1), ask: () => Promise.resolve({ state: 'unsure', distance_m: 400 }) })).toEqual({ at: 'away', distanceM: 400, minutes: 10 })
  })

  it.each([
    ['the church has saved no place', phoneAt(1, 1), () => Promise.resolve({ state: 'no_place' as const }), 'no_place'],
    ['location is blocked', phoneRefusing(1), () => Promise.reject(new Error('never asked')), 'blocked'],
    ['the phone cannot say', phoneRefusing(2), () => Promise.reject(new Error('never asked')), 'unknown'],
    ['the database cannot say', phoneAt(1, 1), () => Promise.reject(new Error('down')), 'unknown'],
  ])('falls back to choosing a time when %s', async (_why, geolocation, ask, at) => {
    const estimate = await estimateFromHere({ geolocation, ask })
    expect(estimate).toEqual({ at })
    expect(estimateWords(estimate)).toMatch(/choose a time\.$/)
  })

  it('says how far and how long in a line, and that the number is theirs to change', () => {
    expect(estimateWords({ at: 'away', distanceM: 3200, minutes: 15 })).toBe('About 3.2 km away: roughly 15 minutes. Change it if you know better.')
    expect(estimateWords({ at: 'away', distanceM: 450, minutes: 10 })).toBe('About 450 m away: roughly 10 minutes. Change it if you know better.')
    expect(estimateWords({ at: 'away', distanceM: 24_000, minutes: 40 })).toBe('About 24 km away: roughly 40 minutes. Change it if you know better.')
    expect(estimateWords({ at: 'church' })).toBe('You are at church already. Press Clock in.')
  })
})
