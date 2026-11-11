/*
 * The installed app's icon is the church's own logo.
 *
 * A phone asks for an app's icon with nobody signed in: the manifest and
 * the pictures it names have to answer a plain GET. The logo lives in the
 * `branding` bucket, which anybody may read (0244: "the mark is public
 * anyway") but which is not a public bucket, so its files have no address
 * a phone can fetch on its own. Two small functions close that gap:
 *
 *   manifest.js   answers /manifest.webmanifest. It asks the bucket which
 *                 icon set is current and names those pictures; with no
 *                 logo, or with the database out of reach, it answers
 *                 with the app's own icons, exactly as the static file did.
 *   app-icon.js   answers /app-icon/<set>/<file>.png by reading that file
 *                 out of the bucket with the app's public key.
 *
 * The app makes the set itself, in the browser of whoever may change the
 * logo (src/lib/appIcon.ts), and stores it at icon/<set>/<file>. A set's
 * name starts with when it was made, so the newest sorts first, and ends
 * with the logo it was made from, so the app can tell when a new logo has
 * not been turned into icons yet.
 *
 * Plain JavaScript, with no build step: Vercel runs it as it is, and the
 * tests import it as it is.
 */

/** The bucket the logo is in, and the folder its icon sets go in. */
export const BUCKET = 'branding'
export const ICON_FOLDER = 'icon'

/** The pictures in a set. The app writes these names; nothing else is served. */
export const ICON_FILES = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']

/** A set's name: base-36 time, a dash, the logo's id. Nothing that could leave the folder. */
const SET_NAME = /^[a-z0-9]{1,16}-[A-Za-z0-9-]{1,64}$/

/** @param {unknown} name */
export function isSetName(name) {
  return typeof name === 'string' && SET_NAME.test(name)
}

/**
 * The newest set among what the bucket lists in the icon folder.
 * @param {unknown} listing what the storage API's list returned
 * @returns {string | null}
 */
export function newestSet(listing) {
  if (!Array.isArray(listing)) return null
  const names = listing.map((entry) => entry?.name).filter(isSetName)
  if (names.length === 0) return null
  // Same-length base-36 stamps sort as text; a longer stamp is a later time.
  const stamp = (name) => name.slice(0, name.indexOf('-'))
  names.sort((a, b) => stamp(b).length - stamp(a).length || (stamp(b) > stamp(a) ? 1 : stamp(b) < stamp(a) ? -1 : 0))
  return names[0]
}

/** Where the app serves a set's picture from. @param {string} set @param {string} file */
export function iconUrl(set, file) {
  return `/app-icon/${set}/${file}`
}

/**
 * The manifest, naming the set's pictures in place of the app's own.
 * With no set it is the base, untouched.
 * @param {Record<string, unknown>} base
 * @param {string | null} set
 */
export function manifestWith(base, set) {
  if (!set) return base
  const small = iconUrl(set, 'icon-192.png')
  return {
    ...base,
    icons: [
      { src: small, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: iconUrl(set, 'icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: iconUrl(set, 'icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: Array.isArray(base.shortcuts)
      ? base.shortcuts.map((shortcut) => ({ ...shortcut, icons: [{ src: small, sizes: '192x192', type: 'image/png' }] }))
      : base.shortcuts,
  }
}

/** The database's address and the app's public key, as the build has them. */
export function supabaseEnv(env = process.env) {
  return {
    url: (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
    key: env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '',
  }
}

/**
 * Ask the bucket which set is current. Null when there is none, and null
 * when it cannot be asked: no icon of the church's is a manifest with the
 * app's own, never an error.
 * @param {{ url: string, key: string }} supabase
 * @param {typeof fetch} [get]
 */
export async function currentSet(supabase, get = fetch) {
  if (!supabase.url || !supabase.key) return null
  try {
    const res = await get(`${supabase.url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { apikey: supabase.key, Authorization: `Bearer ${supabase.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: ICON_FOLDER, limit: 100, offset: 0, sortBy: { column: 'name', order: 'desc' } }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    return newestSet(await res.json())
  } catch {
    return null
  }
}
