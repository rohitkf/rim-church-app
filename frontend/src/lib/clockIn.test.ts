import { describe, expect, it, vi } from 'vitest'
import {
  betterReading,
  churchInstant,
  clockInPhase,
  distanceMetres,
  findPlaces,
  formatDistance,
  groupClockIns,
  maySeeClockIns,
  normalisePostcode,
  refusalWords,
} from './clockIn'

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

describe('when the CLOCK IN button is there', () => {
  const day = {
    due: true,
    opens_at: '2026-11-01T09:25:00Z',
    closes_at: '2026-11-01T13:00:00Z',
    first_call: '2026-11-01T09:30:00Z',
    clocked_at: null,
  }
  const at = (iso: string) => Date.parse(iso)

  it('is not there for somebody not on the day’s rota', () => {
    expect(clockInPhase({ due: false }, at('2026-11-01T10:00:00Z'))).toBe('none')
    expect(clockInPhase(undefined, at('2026-11-01T10:00:00Z'))).toBe('none')
  })

  it('is not there too early — only from the lead time before the first call', () => {
    expect(clockInPhase(day, at('2026-11-01T09:24:59Z'))).toBe('early')
    expect(clockInPhase(day, at('2026-11-01T09:25:00Z'))).toBe('open')
  })

  it('stays until the day’s last service ends, and goes once they have clocked in', () => {
    expect(clockInPhase(day, at('2026-11-01T12:59:00Z'))).toBe('open')
    expect(clockInPhase(day, at('2026-11-01T13:00:00Z'))).toBe('closed')
    expect(clockInPhase({ ...day, clocked_at: '2026-11-01T09:27:00Z' }, at('2026-11-01T09:28:00Z'))).toBe('done')
  })
})

describe('reading the phone', () => {
  it('keeps the reading the phone is surest of', () => {
    const rough = { lat: 1, lng: 1, accuracy: 400, at: 1 }
    const sharp = { lat: 2, lng: 2, accuracy: 12, at: 2 }
    expect(betterReading(null, rough)).toBe(rough)
    expect(betterReading(rough, sharp)).toBe(sharp)
    expect(betterReading(sharp, { ...rough, at: 3 })).toBe(sharp)
  })
})

describe('why a clock-in was refused, in words', () => {
  it('says how sure the phone was and how sure it had to be, with what to try', () => {
    const words = refusalWords({ ok: false, reason: 'too_rough', accuracy_m: 212.4, needed_m: 50 })
    expect(words.title).toContain('± 212 m')
    expect(words.title).toContain('± 50 m')
    expect(words.tips.some((t) => t.includes('Precise Location'))).toBe(true)
  })

  it('says how far away they looked and how near they had to be', () => {
    const words = refusalWords({ ok: false, reason: 'too_far', distance_m: 1450, radius_m: 100 })
    expect(words.title).toContain('1.4 km')
    expect(words.title).toContain('100 m')
  })

  it('says when it opens, on the church’s clock', () => {
    expect(refusalWords({ ok: false, reason: 'not_yet', opens_at: '2026-07-05T08:55:00Z' }, 'Europe/London').title).toBe(
      'Clocking in opens at 09:55.',
    )
  })
})

describe('a time on the church’s clock', () => {
  it('is the right instant in winter and in summer', () => {
    expect(churchInstant('2026-11-01', '09:41', 'Europe/London').toISOString()).toBe('2026-11-01T09:41:00.000Z')
    expect(churchInstant('2026-07-05', '09:41', 'Europe/London').toISOString()).toBe('2026-07-05T08:41:00.000Z')
  })
})

describe('the day’s clock-ins, team by team', () => {
  const row = (id: string, user_id: string) =>
    ({ id, user_id, on_date: '2026-11-01', clocked_at: '2026-11-01T09:30:00Z', method: 'location', latitude: null, longitude: null, accuracy_m: null, distance_m: null, address: null, person: null }) as const
  const names: Record<string, string> = { w: 'Welcome', m: 'Media' }

  it('puts somebody on two teams under both, teams by name, and the unrostered last', () => {
    const groups = groupClockIns(
      [row('c1', 'ann'), row('c2', 'ben'), row('c3', 'cat')],
      [
        { user_id: 'ann', department_id: 'w' },
        { user_id: 'ann', department_id: 'm' },
        { user_id: 'ben', department_id: 'w' },
        { user_id: 'ben', department_id: 'gone' },
      ],
      (id) => names[id] ?? null,
    )
    expect(groups.map((g) => [g.name, g.rows.map((r) => r.id)])).toEqual([
      ['Media', ['c1']],
      ['Welcome', ['c1', 'c2']],
      ['Not on the rota', ['c3']],
    ])
  })
})

describe('who is still to arrive, team by team', () => {
  it('puts them under their teams, by call time, and shows a team nobody has clocked in for yet', () => {
    const groups = groupClockIns(
      [],
      [],
      (id) => ({ w: 'Welcome', m: 'Media' })[id] ?? null,
      [
        { user_id: 'b', department_id: 'w', call_at: '2026-11-01T09:45:00Z', asked: false },
        { user_id: 'a', department_id: 'w', call_at: '2026-11-01T09:15:00Z', asked: true },
      ],
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Welcome')
    expect(groups[0].stillOut.map((o) => o.user_id)).toEqual(['a', 'b'])
  })
})
