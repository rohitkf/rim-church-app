/*
 * Service worker for the RIM app.
 *
 * Hand-written rather than generated, because the one thing that must never
 * happen here is a stale or wrongly-shared answer to a data request: rotas,
 * availability and checklists are read through Supabase with a per-user
 * token, and a cache that served one volunteer another's view would be
 * worse than no offline support at all. So this worker caches exactly two
 * things — the app shell and immutable build assets — and gets out of the
 * way of everything else.
 *
 * Bump CACHE_VERSION to retire every old cache on the next activation.
 */
const CACHE_VERSION = 'v1'
const SHELL_CACHE = `rim-shell-${CACHE_VERSION}`
const ASSET_CACHE = `rim-assets-${CACHE_VERSION}`
const FONT_CACHE = `rim-fonts-${CACHE_VERSION}`
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE]

const SHELL_URL = '/index.html'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // cache: 'reload' so installing a new worker never picks the shell up
      // out of the HTTP cache it is meant to be replacing.
      .then((cache) => cache.addAll([new Request(SHELL_URL, { cache: 'reload' }), OFFLINE_URL])),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((n) => n.startsWith('rim-') && !CURRENT_CACHES.includes(n)).map((n) => caches.delete(n)),
      )
      // Navigation preload lets the browser start the network request while
      // the worker boots, so going online-first costs nothing.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()

      // Deliberately no clients.claim(). Claiming a page that is still
      // loading fires controllerchange in the middle of that load, and the
      // page has no way to tell that apart from a real update — which cost
      // the first visit after a deploy a forced reload that aborted the
      // document mid-flight and left a blank screen. The worker takes over
      // on the next navigation instead, which is one visit later and
      // entirely safe.
    })(),
  )
})

// The page asks for the update rather than being reloaded from under the
// user mid-sentence.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

// A push that arrives while the app is closed. The payload is the same
// shape the page uses for an in-app notification, so both routes end up
// showing the same thing and clicking either lands in the same place.
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // A push with no body, or one that isn't ours. Still worth announcing:
    // userVisibleOnly means the browser will show its own if we don't.
    payload = {}
  }

  const title = payload.title || 'Rehoboth International Ministries'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || 'Something needs you in the app.',
      icon: '/icon-192.png',
      badge: '/badge-96.png',
      // One per kind: ten new posts should be one line and one buzz, not
      // ten of each.
      tag: payload.tag || 'rim',
      data: { href: payload.href || '/' },
    }),
  )
})

// Clicking a notification opens the page it came from — focusing a window
// that is already open rather than piling up new ones.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const href = (event.notification.data && event.notification.data.href) || '/'
  const target = new URL(href, self.location.origin)

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue
        await client.focus()
        // navigate() is not implemented everywhere; the page listens for
        // this message and routes itself, which also keeps the SPA's
        // history intact instead of reloading it.
        client.postMessage({ type: 'NOTIFICATION_CLICK', href: target.pathname + target.search })
        return
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})

function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
}

/** Immutable build output: the filename changes whenever the bytes do. */
function isHashedAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  // Opaque responses (no-cors fonts) report status 0 and are still worth
  // keeping; anything that actually failed is not.
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone())
  }
  return response
}

async function handleNavigation(event) {
  try {
    const preloaded = await event.preloadResponse
    if (preloaded) return preloaded
    return await fetch(event.request)
  } catch {
    // Offline. The app is a single-page app, so any route is served by the
    // one cached shell and the router takes it from there.
    const cache = await caches.open(SHELL_CACHE)
    return (await cache.match(SHELL_URL)) ?? (await cache.match(OFFLINE_URL)) ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever touch plain GETs. A POST to Supabase, an auth refresh, a
  // realtime upgrade — none of that belongs in a cache.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event))
    return
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  if (isFontRequest(url)) {
    event.respondWith(cacheFirst(request, FONT_CACHE))
    return
  }

  if (url.origin === self.location.origin && /\.(png|svg|webmanifest|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  // Everything else — every Supabase call included — goes straight to the
  // network, untouched and uncached.
})
