import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEGACY_WINDOW_MS,
  identityNotice,
  identityOfManifest,
  noteAtStart,
  noticeWords,
  readKnownIdentity,
  rememberIdentity,
  setMadeAt,
  updateWayFor,
  type AppIdentity,
} from './installedIdentity'
import { setNameFor } from './appIcon'
import { detectEnvironment } from './installGuide'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

/*
 * A new logo or name, on a device that already has the app: when the app
 * speaks, and what it says on each kind of device.
 */

const NOW = Date.UTC(2026, 10, 12, 10, 0, 0)
const DAY = 24 * 60 * 60_000
const setMade = (daysAgo: number, logo = 'logo-b') => setNameFor(logo, NOW - daysAgo * DAY)
const identity = (over: Partial<AppIdentity> = {}): AppIdentity => ({ set: setMade(1), name: 'Rehoboth International Ministries', shortName: 'RIM', ...over })

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
  desktopEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
}
const env = (ua: string, touch = 0) => detectEnvironment(ua, touch, false)

describe('what the manifest says the app is', () => {
  it('reads the icon set and both names', () => {
    const set = setMade(1)
    expect(identityOfManifest({ name: ' Rehoboth International Ministries ', short_name: 'RIM', icons: [{ src: `/app-icon/${set}/icon-192.png` }] })).toEqual({
      set,
      name: 'Rehoboth International Ministries',
      shortName: 'RIM',
    })
  })

  it('reads the app’s own icon as no set', () => {
    expect(identityOfManifest({ name: 'RIM', icons: [{ src: '/icon-192.png' }] })).toEqual({ set: null, name: 'RIM', shortName: null })
  })

  it('makes nothing of something that is not a manifest', () => {
    for (const junk of [null, undefined, 'manifest', 7, []]) expect(identityOfManifest(junk)).toBeNull()
  })

  it('reads when a set was made out of its name', () => {
    expect(setMadeAt(setNameFor('logo-b', NOW))).toBe(NOW)
    // The live one, made on the evening of 11 November 2026.
    expect(new Date(setMadeAt('mwchb6w3-2f5d58eb-bf37-4c4e-8982-c6960f31d606')!).toISOString()).toBe('2026-11-11T18:55:14.595Z')
    expect(setMadeAt('nodashatall')).toBeNull()
    expect(setMadeAt('-logo')).toBeNull()
    expect(setMadeAt('UPPER-logo')).toBeNull()
  })
})

describe('whether to speak', () => {
  const ask = (over: Partial<Parameters<typeof identityNotice>[0]>) => identityNotice({ installed: true, current: identity(), known: identity(), now: NOW, ...over })

  it('says nothing when the device has what the manifest names', () => {
    expect(ask({})).toEqual({ change: null, remember: false })
  })

  it('speaks of a new icon', () => {
    expect(ask({ known: identity({ set: setMade(40, 'logo-a') }) })).toEqual({ change: 'icon', remember: false })
  })

  it('speaks of a new name, long or short', () => {
    expect(ask({ known: identity({ name: 'Rehoboth Ministries' }) }).change).toBe('name')
    expect(ask({ known: identity({ shortName: 'Rehoboth' }) }).change).toBe('name')
  })

  it('speaks of both at once', () => {
    expect(ask({ known: identity({ set: setMade(40, 'logo-a'), shortName: 'Rehoboth' }) }).change).toBe('both')
  })

  it('speaks when the logo is taken away and the app wears its own icon again', () => {
    expect(ask({ current: identity({ set: null }) }).change).toBe('icon')
    expect(ask({ current: identity({ set: null }), known: identity({ set: null }) }).change).toBeNull()
  })

  it('never speaks in a browser tab: there is no installed copy to be behind', () => {
    expect(ask({ installed: false, known: identity({ set: setMade(40, 'logo-a') }) })).toEqual({ change: null, remember: false })
    expect(ask({ installed: false, known: null })).toEqual({ change: null, remember: false })
  })

  it('says nothing until the manifest has answered', () => {
    expect(ask({ current: null, known: null })).toEqual({ change: null, remember: false })
  })

  it('notes, without a word, what a copy that has just been installed is wearing', () => {
    expect(ask({ known: 'fresh' })).toEqual({ change: null, remember: true })
  })

  it('tells a device that was here before, when the icon was made lately — it may not have reached it', () => {
    expect(ask({ known: null, current: identity({ set: setMade(1) }) })).toEqual({ change: 'icon', remember: false })
    expect(ask({ known: null, current: identity({ set: setMade(29) }) }).change).toBe('icon')
  })

  it('only notes it when the icon is an old one, or the church has none', () => {
    expect(ask({ known: null, current: identity({ set: setMade(31) }) })).toEqual({ change: null, remember: true })
    expect(ask({ known: null, current: identity({ set: null }) })).toEqual({ change: null, remember: true })
    expect(LEGACY_WINDOW_MS).toBe(30 * DAY)
  })

  it('does not take an icon dated in the future for a recent one', () => {
    expect(ask({ known: null, current: identity({ set: setMade(-2) }) })).toEqual({ change: null, remember: true })
  })
})

describe('what a device remembers', () => {
  let store: Map<string, string>
  let storage: Storage
  beforeEach(() => {
    store = new Map()
    storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    }
  })
  const target = () => {
    const listeners: Record<string, () => void> = {}
    return { addEventListener: (type: string, fn: () => void) => void (listeners[type] = fn), fire: (type: string) => listeners[type]?.() }
  }

  it('keeps an identity, and gives it back', () => {
    expect(readKnownIdentity(storage)).toBeNull()
    rememberIdentity(identity(), storage)
    expect(readKnownIdentity(storage)).toEqual(identity())
  })

  it('reads nonsense, or storage that will not open, as nothing remembered', () => {
    store.set('rim.installed-identity', '{not json')
    expect(readKnownIdentity(storage)).toBeNull()
    store.set('rim.installed-identity', '"a string"')
    expect(readKnownIdentity(storage)).toBeNull()
    expect(readKnownIdentity(null)).toBeNull()
    expect(() => rememberIdentity(identity(), null)).not.toThrow()
    expect(() => rememberIdentity(identity(), { setItem: () => { throw new Error('full') } })).not.toThrow()
  })

  it('marks a Home Screen copy with no session as just installed', () => {
    noteAtStart(true, storage, target())
    expect(readKnownIdentity(storage)).toBe('fresh')
  })

  it('leaves a device that already holds a session with no memory: it was here before', () => {
    store.set('sb-optfeyksexpokamihksp-auth-token', '{"access_token":"x"}')
    noteAtStart(true, storage, target())
    expect(readKnownIdentity(storage)).toBeNull()
  })

  it('marks nothing in a browser tab — until Chrome says it has installed the app', () => {
    store.set('sb-optfeyksexpokamihksp-auth-token', '{"access_token":"x"}')
    const t = target()
    noteAtStart(false, storage, t)
    expect(readKnownIdentity(storage)).toBeNull()
    t.fire('appinstalled')
    expect(readKnownIdentity(storage)).toBe('fresh')
  })

  it('never writes over what a device already remembers', () => {
    rememberIdentity(identity(), storage)
    const t = target()
    noteAtStart(true, storage, t)
    t.fire('appinstalled')
    expect(readKnownIdentity(storage)).toEqual(identity())
  })

  it('does nothing where there is no storage', () => {
    expect(() => noteAtStart(true, null, target())).not.toThrow()
  })
})

describe('how a device comes by the change', () => {
  it('knows which devices do it themselves, which offer it, and which never will', () => {
    expect(updateWayFor(env(UA.androidChrome))).toBe('by-itself')
    expect(updateWayFor(env(UA.samsung))).toBe('by-itself')
    expect(updateWayFor(env(UA.desktopChrome))).toBe('from-menu')
    expect(updateWayFor(env(UA.desktopEdge))).toBe('from-menu')
    expect(updateWayFor(env(UA.iphone, 5))).toBe('add-again')
    // An iPad says it is a Mac; its touch points give it away.
    expect(updateWayFor(env(UA.macSafari, 5))).toBe('add-again')
    expect(updateWayFor(env(UA.androidFirefox))).toBe('add-again')
    expect(updateWayFor(env(UA.macSafari))).toBe('add-again')
  })

  it('tells an Android phone it will change by itself, and may ask first', () => {
    const words = noticeWords('icon', env(UA.androidChrome), 'rim-church-app.vercel.app')
    expect(words.title).toBe('The app has a new icon')
    expect(words.body).toContain('by itself, usually within a day or two')
    expect(words.body).toContain('it may ask you first — say OK')
    expect(words.steps).toEqual([])
  })

  it('tells a computer where the offer is', () => {
    const words = noticeWords('both', env(UA.desktopChrome), 'rim-church-app.vercel.app')
    expect(words.title).toBe('The app has a new name and icon')
    expect(words.body).toContain('“Review app update”')
    expect(words.steps).toEqual([])
  })

  it('tells an iPhone the truth: it never will, what adding it again costs, and how', () => {
    const words = noticeWords('icon', env(UA.iphone, 5), 'rim-church-app.vercel.app')
    expect(words.body).toContain('cannot change it')
    expect(words.body).toContain('sign in again and allow notifications again')
    expect(words.body).toContain('the old one works just the same')
    expect(words.steps).toHaveLength(4)
    expect(words.steps[1]).toBe('Open Safari and go to rim-church-app.vercel.app.')
    expect(words.steps[2]).toContain('“Add to Home Screen”')
  })

  it('tells a browser that only keeps a shortcut to install it again', () => {
    const words = noticeWords('name', env(UA.androidFirefox), 'rim-church-app.vercel.app')
    expect(words.title).toBe('The app has a new name')
    expect(words.body).toContain('remove the app and install it again from rim-church-app.vercel.app')
    expect(words.steps).toEqual([])
  })
})
