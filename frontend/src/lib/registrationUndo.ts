import { useSyncExternalStore } from 'react'
import { dismissToast, showToast } from './toast'
import { supabase } from './supabaseClient'

/**
 * Undo, on the registration pages (0281).
 *
 * The database remembers a registration as it was before the last thing
 * somebody did to it, for ten minutes, and `registration_order_undo` puts
 * exactly that back — the payment as it stood, the check-in, the
 * cancellation, a refund and the bank details it deleted, a note; a
 * walk-in undone is the walk-in gone. Only whoever did it may undo it,
 * and never over somebody else's change; the function refuses in words
 * the page can show.
 *
 * This is the app's half:
 *
 *   the offer   every press that changes a registration says what it did
 *               in a toast with Undo on it, for a few seconds.
 *   the row     for the ten minutes the database will still take it back,
 *               the registration's own row offers Undo to the browser that
 *               did it (`useRecentUndo`): its menu on the event's page, a
 *               line under it at Reception.
 *   the email   a press that writes to the attendee — "your ticket is
 *               confirmed", "we could not find your payment", the ticket
 *               itself — does not write until the offer has passed. A slip
 *               undone never reaches them. If the page goes away first,
 *               what was waiting is sent then: the press stands.
 */

/** How long the toast offers Undo, and how long an email waits for it. */
export const UNDO_OFFER_MS = 10_000
/** The same, as it is running: a test cannot wait ten seconds for an email. */
let offerMs = UNDO_OFFER_MS
/** How long the database will take a change back. */
export const UNDO_KEPT_MS = 10 * 60_000

/** Put a registration back as it was. Answers the word for what was undone. */
export async function undoOrder(orderId: string): Promise<string> {
  const { data, error } = await supabase.rpc('registration_order_undo', { p_id: orderId })
  if (error) throw error
  return typeof data === 'string' ? data : ''
}

/** The registration a ticket code belongs to, for an undo that only has the code (a walk-in). */
export async function orderIdOfCode(code: string): Promise<string> {
  const { data, error } = await supabase.from('registration_orders').select('id').eq('code', code).maybeSingle()
  if (error) throw error
  const id = (data as { id?: string } | null)?.id
  if (!id) throw new Error('That registration is not there any more.')
  return id
}

/* ------------------------------------------------------------------ */
/* What waits for the offer to pass                                    */
/* ------------------------------------------------------------------ */

/** Something held back: `drop` it for good, or send it `now`. */
export interface Waiting {
  drop: () => void
  now: () => void
}

interface Held {
  send: () => void
  timer: ReturnType<typeof setTimeout>
}
const held = new Set<Held>()
let listening = false

/** The page is going away: whatever was waiting goes now, because the press it follows stands. */
function sendAllHeld(): void {
  for (const item of [...held]) {
    clearTimeout(item.timer)
    held.delete(item)
    item.send()
  }
}

function listenForLeaving(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('pagehide', sendAllHeld)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendAllHeld()
  })
}

/**
 * Hold something back until the offer of an undo has passed.
 * `drop` is for an undo that worked; `now` for one that was refused, when
 * the press stands after all and what follows it must still happen.
 */
export function holdBack(send: () => void, ms: number = offerMs): Waiting {
  listenForLeaving()
  const item: Held = {
    send,
    timer: setTimeout(() => {
      held.delete(item)
      send()
    }, ms),
  }
  held.add(item)
  const take = () => {
    clearTimeout(item.timer)
    return held.delete(item)
  }
  return {
    drop: () => void take(),
    now: () => {
      if (take()) send()
    },
  }
}

/* ------------------------------------------------------------------ */
/* What this browser did lately                                        */
/* ------------------------------------------------------------------ */

interface Recent {
  text: string
  at: number
  /** Tells the page when the ten minutes are up. */
  ends: ReturnType<typeof setTimeout>
  /** The toast that offered it, and the email waiting on it. */
  toast?: number
  waiting?: Waiting
}
const recent = new Map<string, Recent>()

// A page that draws "Undo" in a menu draws again when what can be undone
// changes: something was done, something was taken back, the time ran out.
const watchers = new Set<() => void>()
let version = 0
function changed(): void {
  version += 1
  for (const watcher of watchers) watcher()
}

/**
 * The database keeps one thing to undo for a registration: the last. So a
 * second press on the same one takes the first press's toast down — its
 * Undo would take back the second press, not what the toast says. What
 * the first press was holding back still goes when its time comes: that
 * press stands.
 */
function remember(orderId: string, last: Omit<Recent, 'at' | 'ends'>): void {
  const before = recent.get(orderId)
  if (before) {
    clearTimeout(before.ends)
    if (before.toast !== undefined) dismissToast(before.toast)
  }
  recent.set(orderId, { ...last, at: Date.now(), ends: setTimeout(changed, UNDO_KEPT_MS) })
  changed()
}

function forget(orderId: string): void {
  const last = recent.get(orderId)
  if (!last) return
  clearTimeout(last.ends)
  recent.delete(orderId)
  changed()
}

/** What this browser last did to a registration, while the database will still take it back. */
export function recentUndo(orderId: string, now: number = Date.now()): string | null {
  const last = recent.get(orderId)
  if (!last || now - last.at >= UNDO_KEPT_MS) return null
  return last.text
}

/** `recentUndo`, for a page: it draws again when the answer changes. */
export function useRecentUndo(): (orderId: string) => string | null {
  useSyncExternalStore(
    (watcher) => {
      watchers.add(watcher)
      return () => {
        watchers.delete(watcher)
      }
    },
    () => version,
  )
  return recentUndo
}

/* ------------------------------------------------------------------ */
/* The offer                                                           */
/* ------------------------------------------------------------------ */

export interface UndoOffer {
  /** What was done, as the toast says it: "Marked as received". */
  text: string
  /** The registration, or how to find it when only its code is known. */
  orderId: string | (() => Promise<string>)
  /** What follows the press and writes to the attendee: held until the offer passes. */
  then?: () => void
  /** The page reads again: after an undo, and after a refusal, when what it shows may be stale. */
  refresh: () => unknown
  /** Only once it has been taken back: what the page itself must let go of. */
  onUndone?: () => void
  /** The refusal, in the words the viewer should see. */
  words: (error: unknown, fallback: string) => string
}

/**
 * Take the last change to a registration back, and say how it went.
 * Whatever that change was holding back is dropped with it — found by the
 * registration, so the row's Undo drops the same email the toast's would.
 */
export async function runUndo(offer: Pick<UndoOffer, 'orderId' | 'refresh' | 'onUndone' | 'words'>, waiting?: Waiting): Promise<boolean> {
  let waits = waiting
  try {
    const id = typeof offer.orderId === 'string' ? offer.orderId : await offer.orderId()
    const last = recent.get(id)
    waits ??= last?.waiting
    await undoOrder(id)
    if (last?.toast !== undefined) dismissToast(last.toast)
    forget(id)
    waits?.drop()
    showToast('Undone')
    offer.onUndone?.()
    await offer.refresh()
    return true
  } catch (error) {
    // The press stands: whatever was waiting on it goes after all.
    waits?.now()
    showToast(offer.words(error, 'Could not undo that.'), 'error', 6000)
    await offer.refresh()
    return false
  }
}

/**
 * Say what was done, with Undo on it; hold back what would write to the
 * attendee. Answers the undo itself, for a page that keeps a button of its
 * own for it: pressed twice, it is asked once.
 */
export function offerUndo(offer: UndoOffer): () => Promise<boolean> {
  const waiting = offer.then ? holdBack(offer.then) : undefined
  let going: Promise<boolean> | null = null
  const undo = () =>
    (going ??= runUndo(offer, waiting).then((worked) => {
      // Refused: it may be asked again (the signal dropped). Done: never twice.
      if (!worked) going = null
      return worked
    }))
  const toast = showToast(offer.text, 'success', offerMs, { label: 'Undo', run: () => void undo() })
  if (typeof offer.orderId === 'string') remember(offer.orderId, { text: offer.text, toast, waiting })
  return undo
}

/** For tests: nothing waiting, nothing remembered, and the offer as long as the test says. */
export function resetUndoForTests(ms: number = UNDO_OFFER_MS): void {
  for (const item of held) clearTimeout(item.timer)
  held.clear()
  for (const last of recent.values()) clearTimeout(last.ends)
  recent.clear()
  changed()
  offerMs = ms
}
