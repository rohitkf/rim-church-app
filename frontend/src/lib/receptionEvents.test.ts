import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import { eventDays, holderKey, receptionEventChanges, toggleEvent, withEventLimit } from './receptionEvents'

const ama = holderKey('people', 'ama')
const ben = holderKey('people', 'ben')
const ushers = holderKey('teams', 'ushers')

describe('Reception for some events only', () => {
  it('keeps a holder to the events chosen, and gives every event back with null', () => {
    const kept = withEventLimit({}, ama, ['conf'])
    expect(kept).toEqual({ [ama]: ['conf'] })
    expect(withEventLimit(kept, ama, null)).toEqual({})
  })

  it('ticks one event on and off', () => {
    const one = toggleEvent({ [ama]: ['conf'] }, ama, 'camp')
    expect(one[ama]).toEqual(['conf', 'camp'])
    expect(toggleEvent(one, ama, 'conf')[ama]).toEqual(['camp'])
    // The last one off leaves them kept to no events, which is not the same as every event.
    expect(toggleEvent({ [ama]: ['conf'] }, ama, 'conf')).toEqual({ [ama]: [] })
  })

  describe('what is sent to the database', () => {
    const holders = [ama, ben, ushers]

    it('is nothing when nothing changed, whatever order the events are in', () => {
      expect(receptionEventChanges({ [ama]: ['conf', 'camp'] }, { [ama]: ['camp', 'conf'] }, holders)).toEqual([])
      expect(receptionEventChanges({}, {}, holders)).toEqual([])
    })

    it('is a person’s or a team’s new list', () => {
      expect(receptionEventChanges({}, { [ama]: ['conf'], [ushers]: ['camp'] }, holders)).toEqual([
        { person: 'ama', events: ['conf'] },
        { team: 'ushers', events: ['camp'] },
      ])
    })

    it('is null for somebody given every event again', () => {
      expect(receptionEventChanges({ [ben]: ['conf'] }, {}, holders)).toEqual([{ person: 'ben', events: null }])
    })

    it('is an empty list for somebody kept to no events', () => {
      expect(receptionEventChanges({ [ben]: ['conf'] }, { [ben]: [] }, holders)).toEqual([{ person: 'ben', events: [] }])
    })

    it('leaves out a holder taken off Reception: the database drops their limit itself', () => {
      expect(receptionEventChanges({ [ben]: ['conf'] }, {}, [ama, ushers])).toEqual([])
      expect(receptionEventChanges({ [ben]: ['conf'] }, { [ben]: ['camp'] }, [ama])).toEqual([])
    })
  })

  it('says when an event is, in the order the device writes dates', () => {
    expect(eventDays({ starts_at: null, ends_at: null })).toBeNull()
    const camp = { starts_at: '2027-02-12T10:00:00', ends_at: '2027-02-14T15:00:00' }
    // The month is said once, wherever the device puts it — never a bare day in front of a whole date.
    expect(eventDays(camp, 'en-GB')).toMatch(/^12\s*[–-]\s*14 Feb 2027$/)
    expect(eventDays(camp, 'en-US')).toMatch(/^Feb 12\s*[–-]\s*14, 2027$/)
    expect(eventDays({ starts_at: '2026-11-22T10:00:00', ends_at: '2026-11-22T17:00:00' }, 'en-GB')).toBe('22 Nov 2026')
    expect(eventDays({ starts_at: '2026-11-22T10:00:00', ends_at: null }, 'en-GB')).toBe('22 Nov 2026')
    // Across a month end, both months are said.
    expect(eventDays({ starts_at: '2026-11-30T10:00:00', ends_at: '2026-12-01T17:00:00' }, 'en-GB')).toMatch(/30 Nov\s*[–-]\s*1 Dec 2026/)
  })
})
