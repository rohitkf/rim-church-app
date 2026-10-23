import { describe, expect, it } from 'vitest'
import { guestCandidates, guestNote, guestPayload, guestTeams, matchGuests, type TeamPlace } from './pollGuests'

const place = (user_id: string, department_id: string, member_type: 'core' | 'guest', name = user_id): TeamPlace => ({
  user_id,
  department_id,
  member_type,
  team: department_id === 'media' ? 'Media' : department_id === 'audio' ? 'Audio' : 'Worship',
  name,
})

// Ann: guest on Media only. Ben: guest on Media, core on Audio. Cy: guest
// on Media and Worship. Dee: core on Media.
const places = [
  place('ann', 'media', 'guest', 'Ann'),
  place('ben', 'media', 'guest', 'Ben'),
  place('ben', 'audio', 'core', 'Ben'),
  place('cy', 'media', 'guest', 'Cy'),
  place('cy', 'worship', 'guest', 'Cy'),
  place('dee', 'media', 'core', 'Dee'),
]

describe('who is a guest of a poll (0177)', () => {
  it('on a team poll: the guests on that team, whatever else they are on', () => {
    expect(guestCandidates('team', places, { teamId: 'media' }).map((g) => g.id)).toEqual(['ann', 'ben', 'cy'])
    expect(guestCandidates('team', places, { teamId: 'audio' })).toEqual([])
  })

  it('for everyone: a guest somewhere and core nowhere', () => {
    const guests = guestCandidates('everyone', places)
    expect(guests.map((g) => g.id)).toEqual(['ann', 'cy'])
    expect(guests[1].teams.map((t) => t.name)).toEqual(['Media', 'Worship'])
  })

  it('at a service: on the rota as a guest, and core on none of the teams they serve with there', () => {
    const rota = [
      { user_id: 'ann', department_id: 'media' },
      { user_id: 'ben', department_id: 'media' },
      { user_id: 'ben', department_id: 'audio' },
      { user_id: 'dee', department_id: 'media' },
    ]
    expect(guestCandidates('service', places, { rota }).map((g) => g.id)).toEqual(['ann'])
    // Only Media's people: Ben serves there as a guest, and only there.
    expect(guestCandidates('service', places, { rota, teamId: 'media' }).map((g) => g.id)).toEqual(['ann', 'ben'])
  })

  it('never on a poll for named people', () => {
    expect(guestCandidates('people', places)).toEqual([])
  })
})

describe('picking guests', () => {
  const guests = guestCandidates('team', places, { teamId: 'media' })

  it('lists the teams for one-tap buttons and finds by name or team', () => {
    // A team poll's guests carry only that team; asking everyone, all of theirs.
    expect(guestTeams(guests).map((t) => t.name)).toEqual(['Media'])
    const everyone = guestCandidates('everyone', places)
    expect(guestTeams(everyone).map((t) => t.name)).toEqual(['Media', 'Worship'])
    expect(matchGuests(guests, 'an').map((g) => g.id)).toEqual(['ann'])
    expect(matchGuests(everyone, 'worship').map((g) => g.id)).toEqual(['cy'])
  })

  it('stores every guest as null, some as their ids, and none as leaving guests out', () => {
    expect(guestPayload(true, new Set(['ann', 'ben', 'cy']), guests)).toEqual({ include_guests: true, guest_ids: null })
    expect(guestPayload(true, new Set(['ben']), guests)).toEqual({ include_guests: true, guest_ids: ['ben'] })
    expect(guestPayload(true, new Set(), guests)).toEqual({ include_guests: false, guest_ids: null })
    expect(guestPayload(false, new Set(['ann']), guests)).toEqual({ include_guests: false, guest_ids: null })
  })

  it('says on the card when guests were left out or chosen', () => {
    expect(guestNote({ audience: 'team', include_guests: true, guest_ids: null })).toBeNull()
    expect(guestNote({ audience: 'team', include_guests: false, guest_ids: null })).toBe('No guests')
    expect(guestNote({ audience: 'service', include_guests: true, guest_ids: ['a'] })).toBe('1 guest')
    expect(guestNote({ audience: 'people', include_guests: false, guest_ids: null })).toBeNull()
  })
})
