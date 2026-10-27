import { describe, expect, it } from 'vitest'
import { countsLine, prayerSections, whoAsked, type PrayerBoard, type PrayerRequest } from './prayer'

const request = (over: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: 'r1',
  kind: 'general',
  status: 'open',
  body: 'For my mother',
  anonymous: false,
  mine: false,
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '2026-10-20T10:00:00Z',
  answered_at: null,
  closed_at: null,
  testimony: null,
  testimony_named: false,
  shared: false,
  author: { id: 'a', first_name: 'Ama', last_name: 'Owusu' },
  counts: { prayed: 0, praying: 0, fasting: 0 },
  my_response: null,
  responders: null,
  updates: [],
  ...over,
})

describe('the prayer page’s sections', () => {
  const board = (requests: PrayerRequest[], pastoral = false): PrayerBoard => ({ pastoral, moderator: pastoral, requests })

  it('puts open general requests in Requests, answered shared ones in Testimonies, and your own in Mine', () => {
    const s = prayerSections(
      board([
        request({ id: 'open' }),
        request({ id: 'answered', status: 'answered', answered_at: '2026-10-25T10:00:00Z' }),
        request({ id: 'private-shared', kind: 'private', status: 'answered', shared: true, answered_at: '2026-10-26T10:00:00Z' }),
        request({ id: 'private-kept', kind: 'private', status: 'answered', answered_at: '2026-10-26T10:00:00Z' }),
        request({ id: 'mine-closed', mine: true, status: 'closed' }),
      ]),
    )
    expect(s.requests.map((r) => r.id)).toEqual(['open'])
    expect(s.testimonies.map((r) => r.id)).toEqual(['private-shared', 'answered'])
    expect(s.mine.map((r) => r.id)).toEqual(['mine-closed'])
    expect(s.inbox).toEqual([])
  })

  it('gives the pastors an inbox of private requests, open first', () => {
    const s = prayerSections(
      board(
        [
          request({ id: 'kept', kind: 'private', status: 'answered', created_at: '2026-10-26T10:00:00Z' }),
          request({ id: 'waiting', kind: 'private', created_at: '2026-10-21T10:00:00Z' }),
          request({ id: 'gone', kind: 'private', status: 'closed' }),
        ],
        true,
      ),
    )
    expect(s.inbox.map((r) => r.id)).toEqual(['waiting', 'kept'])
  })
})

describe('what a request says', () => {
  it('counts each response, leaving out the ones nobody gave', () => {
    expect(countsLine({ prayed: 12, praying: 5, fasting: 0 })).toBe('12 prayed · 5 still praying')
    expect(countsLine({ prayed: 0, praying: 0, fasting: 0 })).toBeNull()
  })

  it('names who asked only as this person may be told', () => {
    expect(whoAsked(request())).toBe('Ama Owusu')
    expect(whoAsked(request({ anonymous: true, author: null }))).toBe('Anonymous')
    // The pastors are given the name of an anonymous request, and told it is hidden from others.
    expect(whoAsked(request({ anonymous: true }))).toBe('Ama Owusu (anonymous to others)')
    expect(whoAsked(request({ mine: true }))).toBe('You')
    expect(whoAsked(request({ status: 'answered', author: null }))).toBe('Anonymous')
    expect(whoAsked(request({ status: 'answered', testimony_named: true }))).toBe('Ama Owusu')
  })
})
