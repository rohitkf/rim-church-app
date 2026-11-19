import { describe, expect, it } from 'vitest'
import { RELEASES_URL, fetchLatestReleases } from './latestReleases'
import { RELEASES, unseenReleases } from './releases'
import viteConfig from '../../vite.config.ts?raw'
import plugin from '../../build/releasesFile.ts?raw'
import worker from '../../public/sw.js?raw'

/*
 * The notes of the version waiting on the server, read before a reload:
 * every build writes them to a file, and a page on the last build reads
 * that file — falling back on its own notes rather than failing.
 */

const answer = (body: unknown, ok = true) => (() => Promise.resolve({ ok, json: () => Promise.resolve(body) })) as unknown as typeof fetch
const newer = { key: 'tomorrow', date: '2026-12-01', title: 'Tomorrow', lead: 'Not in this build.', points: ['A thing.'] }

describe('the newest version’s notes', () => {
  it('are what the server says, including a release this build has never heard of', async () => {
    const latest = await fetchLatestReleases(answer([newer, ...RELEASES]))
    expect(latest[0]).toEqual(newer)
    expect(latest).toHaveLength(RELEASES.length + 1)
  })

  it('are asked for fresh, from the address the build writes them to', async () => {
    let asked: [unknown, RequestInit | undefined] | null = null
    await fetchLatestReleases(((url: unknown, init?: RequestInit) => {
      asked = [url, init]
      return Promise.resolve({ ok: true, json: () => Promise.resolve(RELEASES) })
    }) as unknown as typeof fetch)
    expect(asked![0]).toBe(RELEASES_URL)
    expect(asked![1]?.cache).toBe('no-store')
    expect(plugin).toContain(`fileName: '${RELEASES_URL.slice(1)}'`)
    expect(viteConfig).toContain('releasesFile()')
  })

  it('fall back on this build’s own notes when the server cannot say', async () => {
    expect(await fetchLatestReleases(answer(null, false))).toBe(RELEASES)
    expect(await fetchLatestReleases((() => Promise.reject(new Error('offline'))) as unknown as typeof fetch)).toBe(RELEASES)
    // The app shell answering in the file's place, or nonsense.
    expect(await fetchLatestReleases((() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('<!doctype')) })) as unknown as typeof fetch)).toBe(RELEASES)
    expect(await fetchLatestReleases(answer([{ key: 'x' }]))).toBe(RELEASES)
    expect(await fetchLatestReleases(answer([]))).toBe(RELEASES)
  })

  it('keeps who a release is for, so the waiting build’s notes are not told to everybody', async () => {
    const waiting = [{ key: 'comments', date: '2026-11-20', title: 'Comments', lead: '', points: [], page: '/service-planner', holds: ['svc.comment', 'svc.comment_read'] }]
    const read = await fetchLatestReleases(answer(waiting))
    expect(read[0].holds).toEqual(['svc.comment', 'svc.comment_read'])
    expect(unseenReleases({}, () => true, read, () => false)).toEqual([])
    expect(unseenReleases({}, () => true, read, (cap) => cap === 'svc.comment')).toHaveLength(1)
  })

  it('is a file the service worker leaves to the network', () => {
    // It keeps hashed assets, fonts and images; a .json at the root is none of them.
    expect(worker).toMatch(/\\\.\(png\|svg\|webmanifest\|ico\)\$/)
    expect(worker).not.toContain('releases.json')
  })
})

describe('what somebody has not been told', () => {
  it('is every release not on their account that they may open, newest first', () => {
    // Somebody who opens every page and holds every right: the Owner.
    const all = unseenReleases({}, () => true, RELEASES, () => true)
    expect(all).toEqual(RELEASES)
    const some = unseenReleases({ [RELEASES[0].key]: 'x' }, (page) => page !== '/countdown', RELEASES, () => true)
    expect(some.some((r) => r.key === RELEASES[0].key)).toBe(false)
    expect(some.some((r) => r.page === '/countdown')).toBe(false)
    expect(some.length).toBeGreaterThan(0)
  })
})
