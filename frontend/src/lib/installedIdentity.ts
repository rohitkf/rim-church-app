import { setOfManifest } from './appIcon'
import type { Environment } from './installGuide'

/**
 * A new logo or name, on a device that already has the app.
 *
 * The icon on a Home Screen and the name under it are the device's copy,
 * taken when the app was installed. The church changes its logo in
 * Settings and the app's own pages change at once — the installed icon
 * does not, and "people have to uninstall it and install it back" (the
 * Owner, November 2026). What a device will do about it is its maker's
 * decision, and nothing a web page can call:
 *
 *   Android (Chrome and its kin)   looks at the manifest when the app is
 *       opened, at most once a day; a changed icon address or name makes
 *       it rebuild the installed app while it is closed, on charge and on
 *       Wi-Fi, and it asks the person before it changes what they see.
 *   A computer (Chrome, Edge)      offers the change in the app window's
 *       menu ("Review app update", Chrome 144 on); nothing is forced.
 *   iPhone and iPad                never. The Home Screen keeps what it
 *       was given; only removing the app and adding it again changes it.
 *   Firefox on Android, Safari on a Mac   the same as an iPhone.
 *
 * The app already does the one thing it has to: a new logo is a new icon
 * set at a new address (lib/appIcon), which is what Chrome goes by — it
 * no longer looks inside a picture whose address has not changed. What is
 * left is that nobody was told. An Android phone asking "Update app?" out
 * of nowhere reads as something wrong; an iPhone never asks at all.
 *
 * So the app says so, once, on the device, in that device's terms. It
 * cannot see the Home Screen. It remembers, per device, the name and the
 * icon set it last told this device about (or that it was installed
 * with), and speaks when the manifest names something else.
 *
 * A device has no memory the first time this runs on it, and there are two
 * kinds of those. One that has just been installed wears the icon it was
 * installed with: the app notes it and says nothing (`noteAtStart` marks
 * it, before anybody signs in — a Home Screen app that has never held a
 * session is new, and so is one Chrome has just said it installed). One
 * that was already in use before this existed may still be wearing an old
 * icon: if the current one was made lately it is told, in words that hold
 * either way; if the icon is an old one, it has long since caught up or
 * never will be noticed, and the app only notes it.
 */

/** What an installed app is known by: its icon set (null: the app's own icon) and its two names. */
export interface AppIdentity {
  set: string | null
  name: string | null
  shortName: string | null
}

const KNOWN_KEY = 'rim.installed-identity'

/**
 * What a device remembers: the identity it was last told about, `fresh`
 * (just installed: whatever the manifest says now is what it has), or
 * nothing — it was in use before any of this was kept.
 */
export type Known = AppIdentity | 'fresh' | null

/** How lately an icon must have been made for a device with no memory to be told about it. */
export const LEGACY_WINDOW_MS = 30 * 24 * 60 * 60_000

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The identity a manifest gives the app — or null when it is not a manifest at all. */
export function identityOfManifest(manifest: unknown): AppIdentity | null {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null
  const m = manifest as { name?: unknown; short_name?: unknown }
  return { set: setOfManifest(manifest), name: text(m.name), shortName: text(m.short_name) }
}

/** Ask the manifest, as a phone does: nobody signed in, fresh from the network. Null when it cannot be asked. */
export async function fetchPublishedIdentity(): Promise<AppIdentity | null> {
  try {
    const res = await fetch('/manifest.webmanifest', { credentials: 'omit' })
    if (!res.ok) return null
    return identityOfManifest(await res.json())
  } catch {
    return null
  }
}

/** When an icon set was made: its name starts with the moment, in base 36 (lib/appIcon's setNameFor). */
export function setMadeAt(set: string): number | null {
  const stamp = set.slice(0, Math.max(0, set.indexOf('-')))
  if (!/^[a-z0-9]{1,16}$/.test(stamp)) return null
  const at = parseInt(stamp, 36)
  return Number.isFinite(at) && at > 0 ? at : null
}

/** What this device was last told about, or installed with. Null: nothing remembered, or storage is closed. */
export function readKnownIdentity(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Known {
  try {
    const raw = storage?.getItem(KNOWN_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as (Partial<AppIdentity> & { fresh?: unknown }) | null
    if (!v || typeof v !== 'object') return null
    if (v.fresh === true) return 'fresh'
    return { set: text(v.set), name: text(v.name), shortName: text(v.shortName) }
  } catch {
    return null
  }
}

export function rememberIdentity(identity: AppIdentity | 'fresh', storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    storage?.setItem(KNOWN_KEY, JSON.stringify(identity === 'fresh' ? { fresh: true } : identity))
  } catch {
    // Private mode, or a full disk: it is told again next time, which is the lesser harm.
  }
}

/** Whether this storage holds somebody's session: the app has been used here before. */
function holdsSession(storage: Pick<Storage, 'length' | 'key'>): boolean {
  for (let i = 0; i < storage.length; i += 1) {
    if (/^sb-.+-auth-token$/.test(storage.key(i) ?? '')) return true
  }
  return false
}

/**
 * At the very start, before anybody signs in: tell a device that has just
 * been installed from one that was in use before this existed.
 *
 * Running installed, remembering nothing and holding no session is a new
 * copy — an iPhone's Home Screen app starts with storage of its own, so
 * it is signed into after it is added. And when Chrome says it has
 * installed the app, in this tab, that is a new copy too. Both are marked
 * `fresh`; a device that already holds a session is left with no memory,
 * which is what says it was here before.
 */
export function noteAtStart(
  installed: boolean,
  storage: Storage | null = safeStorage(),
  target: { addEventListener: (type: string, listener: () => void) => void } | null = typeof window === 'undefined' ? null : window,
): void {
  if (!storage) return
  try {
    if (installed && readKnownIdentity(storage) === null && !holdsSession(storage)) rememberIdentity('fresh', storage)
    target?.addEventListener('appinstalled', () => {
      if (readKnownIdentity(storage) === null) rememberIdentity('fresh', storage)
    })
  } catch {
    // Storage that will not be read is storage with no memory: the app says so once, later.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** What has changed since this device was last told. */
export type IdentityChange = 'icon' | 'name' | 'both'

export interface NoticeDecision {
  /** What to tell them about, or null: nothing to say. */
  change: IdentityChange | null
  /** Nothing to say, and nothing remembered yet: note what the device has now. */
  remember: boolean
}

/** Whether to speak, and about what. */
export function identityNotice(input: { installed: boolean; current: AppIdentity | null; known: Known; now: number }): NoticeDecision {
  const { installed, current, known, now } = input
  // In a browser tab there is no installed copy to be behind: the tab's own icon follows the page.
  if (!installed || !current) return { change: null, remember: false }
  // Just installed: it wears what the manifest names.
  if (known === 'fresh') return { change: null, remember: true }
  if (known === null) {
    // Here before any of this was kept. An icon made lately may not have reached it.
    const made = current.set ? setMadeAt(current.set) : null
    if (made !== null && now >= made && now - made < LEGACY_WINDOW_MS) return { change: 'icon', remember: false }
    return { change: null, remember: true }
  }
  const icon = known.set !== current.set
  const name = known.name !== current.name || known.shortName !== current.shortName
  return { change: icon && name ? 'both' : icon ? 'icon' : name ? 'name' : null, remember: false }
}

/** How a device comes by a new icon or name. */
export type UpdateWay = 'by-itself' | 'from-menu' | 'add-again'

export function updateWayFor(env: Pick<Environment, 'platform' | 'browser'>): UpdateWay {
  if (env.platform === 'ios') return 'add-again'
  // Firefox installs a shortcut, Safari a copy in the Dock; neither looks at the manifest again.
  if (env.browser === 'firefox' || env.browser === 'safari' || env.browser === 'inapp') return 'add-again'
  return env.platform === 'android' ? 'by-itself' : 'from-menu'
}

export interface NoticeWords {
  title: string
  body: string
  /** How to do it by hand, where that is the only way. */
  steps: string[]
}

const WHAT: Record<IdentityChange, string> = { icon: 'icon', name: 'name', both: 'name and icon' }

/** The notice, in the terms of the device it is read on. `host` is the app's address, for typing into Safari. */
export function noticeWords(change: IdentityChange, env: Pick<Environment, 'platform' | 'browser'>, host: string): NoticeWords {
  const what = WHAT[change]
  const title = `The app has a new ${what}`
  const way = updateWayFor(env)
  if (way === 'by-itself') {
    return {
      title,
      body:
        `Your phone changes the ${what} on your Home Screen by itself, usually within a day or two. It does it while the app is closed and the phone is charging on Wi-Fi, and it may ask you first — say OK. ` +
        `If the old one is still there after a few days, remove the app and install it again.`,
      steps: [],
    }
  }
  if (way === 'from-menu') {
    return {
      title,
      body:
        `This computer offers the change itself, usually within a day. Open the ⋮ menu at the top of this window: if it says “Review app update”, choose it. ` +
        `If nothing has changed after a few days, remove the app and install it again.`,
      steps: [],
    }
  }
  if (env.platform === 'ios') {
    return {
      title,
      body:
        `An iPhone or iPad keeps the ${what} the app was added with, and cannot change it. To get the new one, remove the app from your Home Screen and add it again. ` +
        `You will sign in again and allow notifications again, so pick a quiet moment — until then the old one works just the same.`,
      steps: [
        'On your Home Screen, touch and hold this app’s icon and choose to remove or delete it.',
        `Open Safari and go to ${host}.`,
        'Tap the Share button (a square with an arrow pointing up), then “Add to Home Screen”, then Add.',
        'Open the app from its new icon, sign in, and allow notifications when it asks.',
      ],
    }
  }
  return {
    title,
    body: `This browser keeps the ${what} the app was installed with. To get the new one, remove the app and install it again from ${host}. You may have to sign in again — until then the old one works just the same.`,
    steps: [],
  }
}
