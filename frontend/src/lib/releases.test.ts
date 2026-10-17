import { describe, expect, it } from 'vitest'
import { RELEASES, nextUnseenRelease, type Release } from './releases'
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
