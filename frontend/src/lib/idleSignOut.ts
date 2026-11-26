/*
 * A device nobody has used for a month is signed out.
 *
 * A session here never ends by itself: the token is renewed quietly for as
 * long as the browser holds it, so a phone that was lost in the summer, or
 * handed on to a child, still opens the app as its owner in the winter.
 * The time limits Supabase offers for this need a paid plan, so the app
 * keeps its own: each device remembers when it was last used, and one that
 * has stood unused for thirty days signs out the next time it is opened
 * (the Owner, November 2026).
 *
 * Thirty days, not the eight hours a bank would use, on purpose. People
 * open this on their own phones on a Sunday; a limit shorter than the gap
 * between two Sundays would be a sign-in every week, and the last time the
 * app signed people out unasked it read as a locked door (AuthContext's
 * signOut). A month without use is a device its owner has stopped using.
 *
 * It is this device's memory, so it guards this device: a token copied
 * off it is not touched. That needs the server's own limit.
 */

export const IDLE_SIGN_OUT_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const KEY = 'rim.last-used'
/** Said once on the sign-in page after an idle sign-out, then forgotten. */
const NOTICE_KEY = 'rim.signed-out-idle'
/** Writing on every tap would be a write a second; once an hour is as exact as a month needs. */
const WRITE_EVERY_MS = 60 * 60 * 1000

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const safe = <T>(read: () => T, otherwise: T): T => {
  try {
    return read()
  } catch {
    // Storage switched off (a private window): nothing is remembered, so nobody is signed out for it.
    return otherwise
  }
}

/** When this device last used the app, or null if it has never said. */
export function lastUsed(store: Store = localStorage): number | null {
  const raw = safe(() => store.getItem(KEY), null)
  const at = raw ? Number(raw) : NaN
  return Number.isFinite(at) ? at : null
}

/** Remember that the app is in use now. */
export function noteUse(now = Date.now(), store: Store = localStorage): void {
  const last = lastUsed(store)
  if (last !== null && now - last < WRITE_EVERY_MS && now >= last) return
  safe(() => store.setItem(KEY, String(now)), undefined)
}

/**
 * Whether this device has stood unused too long to stay signed in. A
 * device that has never said when it was last used has not: the first
 * visit after this was built starts the count, it does not end a session.
 */
export function idleTooLong(now = Date.now(), store: Store = localStorage): boolean {
  const last = lastUsed(store)
  return last !== null && now - last > IDLE_SIGN_OUT_DAYS * DAY_MS
}

/** Leave word for the sign-in page, and start the count afresh for whoever signs in next. */
export function noteIdleSignOut(store: Store = localStorage, session: Store = sessionStorage): void {
  safe(() => store.removeItem(KEY), undefined)
  safe(() => session.setItem(NOTICE_KEY, '1'), undefined)
}

/** Whether the sign-in page should say why: read once, then cleared. */
export function takeIdleNotice(session: Store = sessionStorage): boolean {
  const said = safe(() => session.getItem(NOTICE_KEY), null) === '1'
  if (said) safe(() => session.removeItem(NOTICE_KEY), undefined)
  return said
}
