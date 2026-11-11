import { describe, expect, it } from 'vitest'
import source from '../../public/sw.js?raw'

/*
 * The worker and the installed app's icon (see api/_appIcon.js).
 *
 * The manifest names the church's own icon, and that changes when the
 * logo does. The worker used to keep the first manifest it ever saw and
 * answer with it for good, which would have pinned every phone to the
 * icon of the day it installed. And the picture beside a notification is
 * the same icon, read from the copy the worker kept.
 *
 * The worker's own file is run here against a cache and a network that
 * are plain objects.
 */

const ORIGIN = 'https://app.test'
const MANIFEST = `${ORIGIN}/manifest.webmanifest`

type Handler = (event: Record<string, unknown>) => void

function boot(network: (request: Request) => Promise<Response>) {
  const handlers: Record<string, Handler> = {}
  const kept = new Map<string, Response>()
  const key = (request: Request | string) => (typeof request === 'string' ? request : new URL(request.url).pathname)
  const cache = {
    match: async (request: Request | string) => kept.get(key(request))?.clone(),
    put: async (request: Request | string, response: Response) => void kept.set(key(request), response),
    addAll: async () => undefined,
  }
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true }
  const shown: { title: string; icon?: string }[] = []
  const self = {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler
    },
    location: { origin: ORIGIN },
    registration: {
      showNotification: (title: string, options: { icon?: string }) => {
        shown.push({ title, icon: options.icon })
        return Promise.resolve()
      },
    },
    clients: {},
  }
  new Function('self', 'caches', 'fetch', source)(self, caches, network)

  const ask = async (address: string): Promise<Response> => {
    let answer: Promise<Response> | undefined
    handlers.fetch({ request: new Request(address), respondWith: (p: Promise<Response>) => (answer = p), waitUntil: () => undefined })
    if (!answer) throw new Error(`the worker left ${address} to the network`)
    return answer
  }
  /** The first icon the manifest it answers with names. */
  const iconOf = async (address: string): Promise<string> => (await (await ask(address)).json()).icons[0].src
  const push = async (payload: Record<string, unknown>) => {
    let done: Promise<unknown> | undefined
    handlers.push({ data: { json: () => payload }, waitUntil: (p: Promise<unknown>) => (done = p) })
    await done
  }
  return { ask, iconOf, push, shown, kept }
}

const manifestNaming = (icon: string) => Response.json({ name: 'RIM', icons: [{ src: icon, sizes: '192x192', type: 'image/png' }] })

describe('the worker and the manifest', () => {
  it('asks the network every time, so a new logo’s icon is seen', async () => {
    let icon = '/icon-192.png'
    const worker = boot(async () => manifestNaming(icon))
    expect(await worker.iconOf(MANIFEST)).toBe('/icon-192.png')

    // The Owner uploads a logo; the manifest now names the icon made from it.
    icon = '/app-icon/mabc-logo1/icon-192.png'
    expect(await worker.iconOf(MANIFEST)).toBe('/app-icon/mabc-logo1/icon-192.png')
  })

  it('answers from the copy it kept when there is no network', async () => {
    let online = true
    const worker = boot(async () => {
      if (!online) throw new TypeError('offline')
      return manifestNaming('/app-icon/mabc-logo1/icon-192.png')
    })
    await worker.ask(MANIFEST)
    online = false
    expect(await worker.iconOf(MANIFEST)).toBe('/app-icon/mabc-logo1/icon-192.png')
  })

  it('still keeps a picture for good once it has it: a set’s pictures never change', async () => {
    let asked = 0
    const worker = boot(async () => {
      asked += 1
      return new Response('png', { status: 200 })
    })
    await worker.ask(`${ORIGIN}/app-icon/mabc-logo1/icon-192.png`)
    await worker.ask(`${ORIGIN}/app-icon/mabc-logo1/icon-192.png`)
    expect(asked).toBe(1)
  })
})

describe('the picture beside a notification', () => {
  it('is the church’s icon when the manifest last read names one', async () => {
    const worker = boot(async () => manifestNaming('/app-icon/mabc-logo1/icon-192.png'))
    await worker.ask(MANIFEST)
    await worker.push({ title: 'Rota published' })
    expect(worker.shown).toEqual([{ title: 'Rota published', icon: '/app-icon/mabc-logo1/icon-192.png' }])
  })

  it('is the app’s own when no manifest has been kept, or it names the app’s own', async () => {
    const fresh = boot(async () => manifestNaming('/icon-192.png'))
    await fresh.push({ title: 'One' })
    await fresh.ask(MANIFEST)
    await fresh.push({ title: 'Two' })
    expect(fresh.shown.map((n) => n.icon)).toEqual(['/icon-192.png', '/icon-192.png'])
  })

  it('never takes a picture from anywhere but the app’s own icon addresses', async () => {
    const worker = boot(async () => manifestNaming('https://elsewhere.example/x.png'))
    await worker.ask(MANIFEST)
    await worker.push({ title: 'One' })
    expect(worker.shown[0].icon).toBe('/icon-192.png')
  })
})
