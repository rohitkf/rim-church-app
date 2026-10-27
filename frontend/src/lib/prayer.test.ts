import { describe, expect, it } from 'vitest'
import { countsLine, prayerSections, previewedBoard, whoAsked, type PrayerBoard, type PrayerRequest } from './prayer'

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
  const board = (requests: PrayerRequest[], pastoral = false): PrayerBoard => ({
    pastoral,
    moderator: pastoral,
    may_assign: pastoral,
    may_run_lists: pastoral,
    lists: [],
    requests,
  })

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
    expect(whoAsked(request({ kind: 'private', author: null }))).toBe('Name kept private')
    expect(whoAsked(request({ status: 'answered', author: null }))).toBe('Anonymous')
    expect(whoAsked(request({ status: 'answered', testimony_named: true }))).toBe('Ama Owusu')
  })
})

describe('the board while the Owner previews a role', () => {
  const owners: PrayerBoard = {
    pastoral: true,
    moderator: true,
    may_assign: true,
    may_run_lists: true,
    lists: [
      { id: 'on', name: 'Mine', mine: true, members: { teams: [], people: [] }, items: [] },
      { id: 'off', name: 'Theirs', mine: false, members: { teams: [], people: [] }, items: [] },
    ],
    requests: [
      request({ id: 'private', kind: 'private' }),
      request({ id: 'anon', anonymous: true, responders: [{ first_name: 'B', last_name: 'C', kind: 'prayed' }] }),
      request({ id: 'named' }),
      request({ id: 'closed', status: 'closed' }),
      request({ id: 'own', mine: true, kind: 'private' }),
    ],
  }

  it('is left alone when nothing is previewed, or a Pastor is', () => {
    expect(previewedBoard(owners, null)).toBe(owners)
    expect(previewedBoard(owners, { as: 'pastor' })).toBe(owners)
  })

  it('takes away the pastors’ view for anybody else: private requests, anonymous names, who prayed, the tools', () => {
    const b = previewedBoard(owners, { as: 'church' })
    expect(b).toMatchObject({ pastoral: false, moderator: false, may_assign: false, may_run_lists: false })
    expect(b.requests.map((r) => r.id)).toEqual(['anon', 'named', 'own'])
    const anon = b.requests.find((r) => r.id === 'anon')!
    expect(anon.author).toBeNull()
    expect(anon.responders).toBeNull()
    expect(b.requests.find((r) => r.id === 'named')!.author).not.toBeNull()
    expect(b.lists.map((l) => l.id)).toEqual(['on'])
    expect(b.lists[0].members).toBeNull()
  })

  it('keeps an Admin able to take down a general request', () => {
    expect(previewedBoard(owners, { as: 'admin' }).moderator).toBe(true)
  })
})
