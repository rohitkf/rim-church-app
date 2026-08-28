/**
 * The escape hatch.
 *
 * A single-page app that installs a service worker can get itself into a
 * state no reload will fix: a worker from an older deploy still controlling
 * the page, a cached shell naming assets that no longer exist, an auth
 * token that the server will never accept again. Each is rare; together
 * they are common enough that the app has to be able to let itself go
 * without asking anyone to open developer tools.
 *
 * So: drop every service worker, every cache, and the stored session — then
 * come back from the network. Nothing here is data the app owns; all of it
 * is a copy of something the server can send again.
 */
export async function resetApp(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // An unregister that fails leaves the worker in place; the caches and
    // the reload below are still worth doing.
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  } catch {
    // Private mode, or a quota error. Carry on.
  }

  try {
    // Only Supabase's own keys: a theme or a team-style preference is the
    // person's, and losing it would be a small rudeness for no gain.
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-')) localStorage.removeItem(key)
    }
  } catch {
    // Storage disabled entirely. The reload still helps.
  }

  // Bypasses the HTTP cache for the document itself, which is the one thing
  // a plain reload might not.
  window.location.replace(`${window.location.origin}/?fresh=${Date.now()}`)
}
