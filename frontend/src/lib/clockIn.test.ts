import { describe, expect, it, vi } from 'vitest'
import { distanceMetres, findPlaces, formatDistance, maySeeClockIns, normalisePostcode } from './clockIn'

const none = { teams: [], people: [] }

describe('who may see the Clock In page', () => {
  const base = { isAdmin: false, isOwner: false, watching: false, myId: 'me', teamIds: [], viewers: none }

  it('is the Owner, Admins and Overwatch out of the box, and nobody else', () => {
    expect(maySeeClockIns({ ...base, isAdmin: true })).toBe(true)
    expect(maySeeClockIns({ ...base, isOwner: true })).toBe(true)
    expect(maySeeClockIns({ ...base, watching: true })).toBe(true)
    expect(maySeeClockIns({ ...base, teamIds: ['media'] })).toBe(false)
  })

  it('opens to a named person, and to everybody on a named team', () => {
    expect(maySeeClockIns({ ...base, viewers: { teams: [], people: ['me'] } })).toBe(true)
    expect(maySeeClockIns({ ...base, teamIds: ['welcome'], viewers: { teams: ['welcome'], people: [] } })).toBe(true)
    expect(maySeeClockIns({ ...base, teamIds: ['media'], viewers: { teams: ['welcome'], people: ['you'] } })).toBe(false)
  })
})

describe('distances', () => {
  it('measures metres on the ground, as the database will', () => {
    // Trafalgar Square to Charing Cross: about 220 m.
    const d = distanceMetres({ lat: 51.50809, lng: -0.12804 }, { lat: 51.50735, lng: -0.12513 })
    expect(d).toBeGreaterThan(205)
    expect(d).toBeLessThan(225)
    expect(distanceMetres({ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.1 })).toBe(0)
  })

  it('reads at a glance', () => {
    expect(formatDistance(42.4)).toBe('42 m')
    expect(formatDistance(1234)).toBe('1.2 km')
    expect(formatDistance(23456)).toBe('23 km')
  })
})

describe('UK postcodes', () => {
  it('are tidied the way the Post Office writes them', () => {
    expect(normalisePostcode('sw1a1aa')).toBe('SW1A 1AA')
    expect(normalisePostcode(' m1 1ae ')).toBe('M1 1AE')
    expect(normalisePostcode('EC1A-1BB')).toBe('EC1A 1BB')
  })

  it('are told apart from an address', () => {
    expect(normalisePostcode('12 High Street')).toBeNull()
    expect(normalisePostcode('London')).toBeNull()
  })
})

describe('finding the church', () => {
  const reply = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

  it('asks postcodes.io for a postcode', async () => {
    const fetcher = vi.fn(() =>
      reply({ result: { postcode: 'SW1A 1AA', latitude: 51.501, longitude: -0.1416, admin_ward: 'St James’s', admin_district: 'Westminster' } }),
    )
    const found = await findPlaces('sw1a1aa', fetcher as unknown as typeof fetch)
    expect(fetcher).toHaveBeenCalledWith('https://api.postcodes.io/postcodes/SW1A%201AA')
    expect(found).toEqual([{ label: 'SW1A 1AA · St James’s, Westminster', postcode: 'SW1A 1AA', lat: 51.501, lng: -0.1416 }])
  })

  it('says nothing was found for a postcode that does not exist', async () => {
    const fetcher = vi.fn(() => reply({ status: 404, error: 'Postcode not found' }, 404))
    expect(await findPlaces('ZZ9 9ZZ', fetcher as unknown as typeof fetch)).toEqual([])
  })

  it('asks OpenStreetMap for an address, in the UK only', async () => {
    const fetcher = vi.fn(() =>
      reply([{ display_name: 'St Mary’s Church, High Street, Reading', lat: '51.455', lon: '-0.971', address: { postcode: 'rg1 2lu' } }]),
    )
    const found = await findPlaces('St Mary’s Church Reading', fetcher as unknown as typeof fetch)
    const url = String((fetcher.mock.calls[0] as unknown[])[0])
    expect(url).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/)
    expect(url).toContain('countrycodes=gb')
    expect(found).toEqual([{ label: 'St Mary’s Church, High Street, Reading', postcode: 'RG1 2LU', lat: 51.455, lng: -0.971 }])
  })

  it('says so when a finder does not answer', async () => {
    const fetcher = vi.fn(() => reply({}, 503))
    await expect(findPlaces('High Street', fetcher as unknown as typeof fetch)).rejects.toThrow(/did not answer/)
  })
})
