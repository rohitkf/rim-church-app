import { isRouteErrorResponse } from 'react-router-dom'

/**
 * What went wrong with a page, sorted into the three things a person can
 * do something about.
 *
 * Until now a page that failed was answered by whoever caught it first,
 * and for most failures that was the router's own screen: "Unexpected
 * Application Error!", the raw message, and a note addressed to the
 * developer. The Owner asked for a proper page with a way back to the
 * Dashboard instead (November 2026). The pages are components/ErrorScreen
 * and the three that use it; this file is the judgement they share.
 *
 *   not-found  the address leads nowhere. Nothing is broken; go somewhere.
 *   stale      the page's code would not download. Nearly always an app
 *              that was updated while this tab was open (each release
 *              renames the files, and the old names are gone), sometimes
 *              a connection that dropped. Reloading fixes the first and
 *              does no harm to the second.
 *   broken     the page threw while it was being drawn. A bug; the way
 *              out is another page, and the detail is for whoever fixes it.
 */
export type PageErrorKind = 'not-found' | 'stale' | 'broken'

/**
 * A lazily loaded file that would not load. Each browser words it its own
 * way and none of them gives it a type of its own, so it is known by its
 * words — the same few every bundler's users match on.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return (
    /dynamically imported module/i.test(message) || // Chromium, Firefox
    /Importing a module script failed/i.test(message) || // Safari
    /module script.*MIME type/i.test(message) || // a missing file answered with the app's own page
    /Unable to preload CSS/i.test(message) // Vite, for the page's stylesheet
  )
}

export function pageErrorKind(error: unknown): PageErrorKind {
  if (isRouteErrorResponse(error)) return error.status === 404 ? 'not-found' : 'broken'
  return isChunkLoadError(error) ? 'stale' : 'broken'
}

/**
 * The error in a line somebody could read out or paste to whoever looks
 * after the app: what it calls itself and what it said, never a stack.
 */
export function errorSummary(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim()
  if (error instanceof Error) {
    const said = error.message.split('\n')[0].trim()
    return said ? `${error.name}: ${said}` : error.name
  }
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'An error with nothing to say for itself'
}

/**
 * The database saying "there is no such row": an id that is not a uuid
 * (22P02, what a link cut short produces) or a lookup of exactly one row
 * that found none (PGRST116). On a page about one thing that is "not
 * found", not a failure to try again (components/QueryState).
 */
export function isNoSuchRow(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { code } = error as { code?: unknown }
  return code === '22P02' || code === 'PGRST116'
}

const RELOADED_AT = 'rim:reloaded-for-stale-page'
/** Long enough that a reload which did not help is not tried again in a loop. */
const ONCE_PER_MS = 60_000

/**
 * Whether to reload by itself for a stale page, which it may do once.
 *
 * Somebody whose tab is a release behind should not have to read a page
 * and press a button to get the page they asked for: the reload they
 * would do is done for them. Once, though — if the file still will not
 * load (no connection, a real fault) the second attempt would be the
 * first of a loop, so it is remembered for a minute and the page with the
 * button is shown instead. Storage that cannot be read is "do not": a
 * loop is worse than a button.
 */
export function mayReloadOnce(now: number = Date.now(), storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): boolean {
  if (!storage) return false
  try {
    const last = Number(storage.getItem(RELOADED_AT) ?? 0)
    if (Number.isFinite(last) && last > 0 && now - last < ONCE_PER_MS) return false
    storage.setItem(RELOADED_AT, String(now))
    return true
  } catch {
    return false
  }
}

function safeStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
