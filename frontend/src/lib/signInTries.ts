/*
 * Five wrong passwords, then a wait.
 *
 * Nothing slowed somebody typing guesses into the sign-in page. The lock
 * Supabase offers on an account needs its most expensive plan; what it
 * does on every plan is limit how fast one address on the internet may
 * try, which stops a program and not a person at the form. So the form
 * counts for itself: after five wrong passwords for one email in a quarter
 * of an hour it stops asking the server for a minute, then five, then
 * fifteen, and says so, with the way to a new password beside it.
 *
 * This is the form's own count, kept in this browser. It slows a person at
 * a keyboard and tells an honest one what to do next; it is not what
 * stands between an attacker and the server, and does not pretend to be.
 */

export const TRIES_BEFORE_A_WAIT = 5
const WINDOW_MS = 15 * 60 * 1000
const WAITS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]
const KEY = 'rim.sign-in-tries'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
interface Tries {
  /** When each wrong password was typed, newest last. */
  at: number[]
  /** How many waits this email has already sat through. */
  waits: number
  /** Until when the form will not ask again. */
  until: number
}

const who = (email: string) => email.trim().toLowerCase()

function read(store: Store): Record<string, Tries> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Tries>) : {}
  } catch {
    return {}
  }
}

function write(store: Store, all: Record<string, Tries>): void {
  try {
    store.setItem(KEY, JSON.stringify(all))
  } catch {
    // Storage off: nothing is counted, and nobody is made to wait.
  }
}

/** How long, in milliseconds, before this email may be tried again. Nought when it may. */
export function waitFor(email: string, now = Date.now(), store: Store = localStorage): number {
  const mine = read(store)[who(email)]
  return mine && mine.until > now ? mine.until - now : 0
}

/** A wrong password for this email. Returns the wait it has earned, if any. */
export function noteWrongPassword(email: string, now = Date.now(), store: Store = localStorage): number {
  const all = read(store)
  const mine = all[who(email)] ?? { at: [], waits: 0, until: 0 }
  const recent = [...mine.at.filter((t) => now - t < WINDOW_MS), now]
  if (recent.length >= TRIES_BEFORE_A_WAIT) {
    const wait = WAITS_MS[Math.min(mine.waits, WAITS_MS.length - 1)]
    all[who(email)] = { at: [], waits: mine.waits + 1, until: now + wait }
    write(store, all)
    return wait
  }
  all[who(email)] = { ...mine, at: recent }
  write(store, all)
  return 0
}

/** Signed in: the count for this email starts again. */
export function forgetTries(email: string, store: Store = localStorage): void {
  const all = read(store)
  if (!(who(email) in all)) return
  delete all[who(email)]
  write(store, all)
}

/** "1 minute", "5 minutes", "40 seconds". */
export function waitWords(ms: number): string {
  if (ms < 60 * 1000) {
    const s = Math.max(1, Math.ceil(ms / 1000))
    return `${s} second${s === 1 ? '' : 's'}`
  }
  const m = Math.ceil(ms / 60000)
  return `${m} minute${m === 1 ? '' : 's'}`
}
