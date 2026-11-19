import { describe, expect, it } from 'vitest'
import { RELEASES, nextUnseenRelease, unseenReleases, type Release } from './releases'
import { CAPABILITY_KEYS } from './permissions'
import { ruleFor } from './pageAccess'

const releases: Release[] = [
  { key: 'two', date: '2026-11-01', title: 'Two', lead: '', points: [], page: '/volunteers' },
  { key: 'one', date: '2026-10-01', title: 'One', lead: '', points: [], page: '/stage' },
]

describe('what is new', () => {
  it('is the newest release not yet seen', () => {
    expect(nextUnseenRelease({}, () => true, releases)?.key).toBe('two')
    expect(nextUnseenRelease({ two: 'x' }, () => true, releases)?.key).toBe('one')
    expect(nextUnseenRelease({ two: 'x', one: 'x' }, () => true, releases)).toBeNull()
  })
  it('skips a release about a page this person cannot open', () => {
    expect(nextUnseenRelease({}, (p) => p !== '/volunteers', releases)?.key).toBe('one')
  })
  it('tells a release about a right only to somebody who holds one of them', () => {
    const news: Release[] = [{ key: 'comments', date: '2026-11-20', title: 'Comments', lead: '', points: [], page: '/service-planner', holds: ['svc.comment', 'svc.comment_read'] }]
    const open = () => true
    // A Pastor writes them, an Admin reads them: either is told.
    expect(nextUnseenRelease({}, open, news, (cap) => cap === 'svc.comment')?.key).toBe('comments')
    expect(nextUnseenRelease({}, open, news, (cap) => cap === 'svc.comment_read')?.key).toBe('comments')
    expect(unseenReleases({}, open, news, (cap) => cap === 'svc.comment_read').map((r) => r.key)).toEqual(['comments'])
    // Somebody who opens the page and holds neither is not.
    expect(nextUnseenRelease({}, open, news, () => false)).toBeNull()
    expect(unseenReleases({}, open, news, () => false)).toEqual([])
    // Nor is anybody, when nobody says what the person holds: told to nobody, not to everybody.
    expect(unseenReleases({}, open, news)).toEqual([])
    // And the page still has to open.
    expect(nextUnseenRelease({}, () => false, news, () => true)).toBeNull()
  })

  it('names only rights there are, on its releases about a right', () => {
    for (const r of RELEASES) for (const cap of r.holds ?? []) expect(CAPABILITY_KEYS, `${r.key}: ${cap}`).toContain(cap)
    expect(RELEASES.find((r) => r.key === 'session-comments')?.holds).toEqual(['svc.comment', 'svc.comment_read'])
  })

  it('ships releases with keys the database will accept, about pages that exist', () => {
    for (const r of RELEASES) {
      expect(r.key).toMatch(/^[a-z0-9_-]{1,60}$/)
      if (r.page) expect(ruleFor(r.page), r.key).not.toBeNull()
      if (r.link) expect(ruleFor(r.link.to), r.key).not.toBeNull()
    }
    const keys = RELEASES.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
