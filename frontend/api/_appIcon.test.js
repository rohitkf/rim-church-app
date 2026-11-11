import { afterEach, describe, expect, it, vi } from 'vitest'
import { ICON_FILES, currentSet, isSetName, manifestWith, newestSet } from './_appIcon.js'
import { BASE_MANIFEST } from './_manifestBase.js'
import { GET as manifest } from './manifest.js'
import { GET as appIcon } from './app-icon.js'
import config from '../vercel.json'
import staticManifest from '../public/manifest.webmanifest?raw'
import { ICON_SPECS, newestSet as appNewestSet, setNameFor } from '../src/lib/appIcon'

/*
 * The installed app's icon is the App Logo: the manifest names the icon
 * set the app made from it, and the pictures are read out of the bucket.
 */

const ID = '2f5d58eb-0c1e-4a57-9d2b-7c1f0a9e4b11'
const earlier = setNameFor(ID, 1_700_000_000_000)
const later = setNameFor('0a0a0a0a-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1_800_000_000_000)

const env = (values) => {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the two copies', () => {
  it('of the manifest say the same thing', () => {
    expect(BASE_MANIFEST).toEqual(JSON.parse(staticManifest))
  })

  it('of the set’s file names are the same, in the app that writes them and the function that serves them', () => {
    expect(ICON_FILES).toEqual(ICON_SPECS.map((spec) => spec.file))
  })

  it('agree on which set is the newest', () => {
    for (const names of [[earlier, later], [later, earlier], [earlier], [], ['.emptyFolderPlaceholder', earlier]]) {
      expect(newestSet(names.map((name) => ({ name })))).toBe(appNewestSet(names))
    }
  })
})

describe('which set is current', () => {
  it('is the newest of what the bucket lists', () => {
    expect(newestSet([{ name: earlier }, { name: later }])).toBe(later)
  })

  it('is none when the bucket lists nothing, or something that is not a list', () => {
    expect(newestSet([])).toBeNull()
    expect(newestSet({ error: 'nope' })).toBeNull()
    expect(newestSet(null)).toBeNull()
  })

  it('takes only a name the app could have written', () => {
    expect(isSetName(earlier)).toBe(true)
    for (const bad of ['', '..', '../x', 'a/b', 'abc', 'abc-', '-abc', 'ab c-def', null, 7]) expect(isSetName(bad)).toBe(false)
  })

  it('is none when the database cannot be asked, rather than an error', async () => {
    const down = () => Promise.reject(new Error('offline'))
    expect(await currentSet({ url: 'https://db.example.co', key: 'k' }, down)).toBeNull()
    expect(await currentSet({ url: '', key: '' })).toBeNull()
    const refused = () => Promise.resolve(new Response('no', { status: 500 }))
    expect(await currentSet({ url: 'https://db.example.co', key: 'k' }, refused)).toBeNull()
  })

  it('asks as anybody signed out would, for the icon folder of the branding bucket', async () => {
    const asked = vi.fn(() => Promise.resolve(Response.json([{ name: later }])))
    expect(await currentSet({ url: 'https://db.example.co', key: 'public-key' }, asked)).toBe(later)
    const [address, request] = asked.mock.calls[0]
    expect(address).toBe('https://db.example.co/storage/v1/object/list/branding')
    expect(request.headers.Authorization).toBe('Bearer public-key')
    expect(JSON.parse(request.body).prefix).toBe('icon')
  })
})

describe('the manifest', () => {
  it('is the app’s own, untouched, when the church has no icon set', () => {
    expect(manifestWith(BASE_MANIFEST, null)).toBe(BASE_MANIFEST)
  })

  it('names the set’s pictures in every size, and on the shortcuts, when it has', () => {
    const made = manifestWith(BASE_MANIFEST, later)
    expect(made.icons).toEqual([
      { src: `/app-icon/${later}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/app-icon/${later}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/app-icon/${later}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
    expect(made.shortcuts.every((s) => s.icons[0].src === `/app-icon/${later}/icon-192.png`)).toBe(true)
    // Everything a phone knows the app by stays as it was: only the pictures change.
    for (const key of ['name', 'short_name', 'id', 'start_url', 'scope', 'display']) expect(made[key]).toBe(BASE_MANIFEST[key])
  })

  it('is answered with the church’s icons when the bucket has a set', async () => {
    env({ VITE_SUPABASE_URL: 'https://db.example.co/', VITE_SUPABASE_ANON_KEY: 'public-key' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json([{ name: earlier }, { name: later }]))))
    const res = await manifest()
    expect(res.headers.get('Content-Type')).toContain('application/manifest+json')
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=300')
    expect((await res.json()).icons[0].src).toBe(`/app-icon/${later}/icon-192.png`)
  })

  it('is answered with the app’s own when the database is out of reach: never an error', async () => {
    env({ VITE_SUPABASE_URL: 'https://db.example.co', VITE_SUPABASE_ANON_KEY: 'public-key' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    const res = await manifest()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(BASE_MANIFEST)
  })
})

describe('a picture of the set', () => {
  const ask = (set, file) => appIcon(new Request(`https://church.example/api/app-icon?set=${encodeURIComponent(set)}&file=${encodeURIComponent(file)}`))

  it('is read out of the bucket with the public key, and kept for good by whoever asked', async () => {
    env({ VITE_SUPABASE_URL: 'https://db.example.co', VITE_SUPABASE_ANON_KEY: 'public-key' })
    const fetched = vi.fn(() => Promise.resolve(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 })))
    vi.stubGlobal('fetch', fetched)
    const res = await ask(later, 'icon-512.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toContain('immutable')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
    expect(fetched.mock.calls[0][0]).toBe(`https://db.example.co/storage/v1/object/authenticated/branding/icon/${later}/icon-512.png`)
  })

  it('sends the asker to the app’s own icon when the picture is not there, and that is not kept', async () => {
    env({ VITE_SUPABASE_URL: 'https://db.example.co', VITE_SUPABASE_ANON_KEY: 'public-key' })
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('gone', { status: 400 }))))
    const res = await ask(later, 'apple-touch-icon.png')
    expect(res.status).toBe(307)
    expect(res.headers.get('Location')).toBe('/apple-touch-icon.png')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('never asks the bucket for a name the app did not write', async () => {
    env({ VITE_SUPABASE_URL: 'https://db.example.co', VITE_SUPABASE_ANON_KEY: 'public-key' })
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)
    expect((await ask(later, '../../logo/secret.png')).status).toBe(404)
    expect((await ask(later, 'anything.png')).status).toBe(404)
    expect((await ask('../logo', 'icon-192.png')).status).toBe(307)
    expect((await ask('a/b', 'icon-192.png')).status).toBe(307)
    expect(fetched).not.toHaveBeenCalled()
  })
})

describe('the addresses', () => {
  const rewrites = config.rewrites.map((r) => r.source)

  it('reach the functions before the app’s own catch-all', () => {
    const all = rewrites.indexOf('/(.*)')
    expect(rewrites.indexOf('/manifest.webmanifest')).toBeGreaterThanOrEqual(0)
    expect(rewrites.indexOf('/manifest.webmanifest')).toBeLessThan(all)
    expect(rewrites.indexOf('/app-icon/:set/:file')).toBeLessThan(all)
    expect(config.rewrites.find((r) => r.source === '/app-icon/:set/:file').destination).toBe('/api/app-icon?set=:set&file=:file')
    expect(config.rewrites.find((r) => r.source === '/manifest.webmanifest').destination).toBe('/api/manifest')
  })
})
