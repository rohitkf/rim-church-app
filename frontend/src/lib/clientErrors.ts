import { supabase, isSupabaseConfigured } from './supabaseClient'
import { isStandalone, ownBuildId } from './pwa'
import { isChunkLoadError, isNoSuchRow } from './pageErrors'
import { isAccountRemoved } from './accountRemoved'
import { isTurnedAway } from './standing'
import { isNetworkFailure, nameOf, saidBy } from './networkFailure'

export { isNetworkFailure }

/**
 * Telling the church that something broke on somebody's device (0284).
 *
 * Until now a page that failed wrote to that phone's console and nowhere
 * else: the Owner learned of it when somebody said so, without the page,
 * the build or what the error was. This sends each failure worth knowing
 * about to `report_client_error`, which keeps it for Settings › App
 * Health and answers a short reference the broken page can show.
 *
 * Two rules shape everything here.
 *
 * It must never make things worse. Nothing in this file throws, nothing
 * waits on it, and it cannot report its own failure: a report that cannot
 * be sent is dropped.
 *
 * Most failures are not news. A phone with no signal, a tab a release
 * behind, a save the database rightly refused, a row that is not there —
 * each already has its own answer on the page, and a log full of them
 * hides the one that matters. So a failure is judged first
 * (`worthReporting`), and what is sent is what points at the app being
 * wrong: it threw, it asked the database for something that does not
 * exist, or it could not read the answer.
 */

/** Which net caught it. The database's check on client_errors.source lists the same six. */
export const ERROR_SOURCES = ['page', 'boundary', 'window', 'promise', 'query', 'save'] as const
export type ErrorSource = (typeof ERROR_SOURCES)[number]

const MESSAGE_MAX = 500
const STACK_MAX = 2000
const DEVICE_MAX = 200

/** A database or API error as the client hands it over: an object, not an Error. */
interface ApiError {
  code?: unknown
  message?: unknown
}

const codeOf = (error: unknown): string => {
  if (!error || typeof error !== 'object') return ''
  const { code } = error as ApiError
  return typeof code === 'string' ? code : ''
}

/**
 * The database saying the app asked for something it has not got, or has
 * run out of room to answer: a function, column or table that does not
 * exist (the release went out ahead of its migration), a statement that
 * ran out of time, no connection to spare, or its own internal error.
 */
export function isDatabaseFault(error: unknown): boolean {
  const code = codeOf(error)
  if (!code) return false
  return (
    /^PGRST2\d\d$/.test(code) || // the API's schema cache has no such function, column, table or relationship
    code === '42883' || // undefined function
    code === '42703' || // undefined column
    code === '42P01' || // undefined table
    code === '42804' || // datatype mismatch
    code === '57014' || // statement timeout
    code.startsWith('53') || // out of connections, memory or disk
    code === 'XX000' // internal error
  )
}

/** The app could not read what the database answered: a schema of ours refused it. */
const isUnreadAnswer = (error: unknown) => nameOf(error) === 'ZodError'

/** The code itself went wrong, rather than the request. */
const isProgrammingError = (error: unknown) =>
  ['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'EvalError', 'URIError'].includes(nameOf(error))

/** Not ours to mend: another site's script, a browser extension, a browser's own grumble. */
function isNotOurs(error: unknown, filename?: string | null): boolean {
  const said = saidBy(error)
  if (/^script error\.?$/i.test(said.trim())) return true // another origin's script; the browser hides the rest
  if (/resizeobserver loop/i.test(said)) return true // a notice, not a failure
  const where = `${filename ?? ''}\n${error instanceof Error ? (error.stack ?? '') : ''}`
  return /(?:chrome|moz|safari-web)-extension:\/\/|webkit-masked-url:\/\//i.test(where)
}

/**
 * Whether a failure is worth telling the church about.
 *
 * Never: no connection, a page a release behind (it reloads itself), an
 * account removed or turned away at the door, a row that is not there,
 * something that is not this app's.
 *
 * A page, the boundary, the window, a promise: anything else. They threw.
 *
 * A read: the database's own faults, an answer the app could not read, a
 * mistake in the code, and a refusal — a read is never refused by a rule
 * of the church's (those return fewer rows, not an error), so "permission
 * denied" on one is a column or a function the app should not have asked
 * for.
 *
 * A save: the same, without the refusal. "You may not" and "sold out" are
 * the database doing its job, and the page already says so.
 */
export function worthReporting(source: ErrorSource, error: unknown, filename?: string | null): boolean {
  if (error === null || error === undefined || error === '') return false
  if (isNetworkFailure(error) || isChunkLoadError(error)) return false
  if (isAccountRemoved(error) || isTurnedAway(error) || isNoSuchRow(error)) return false
  if (isNotOurs(error, filename)) return false
  if (source === 'query') return isDatabaseFault(error) || isUnreadAnswer(error) || isProgrammingError(error) || codeOf(error) === '42501'
  if (source === 'save') return isDatabaseFault(error) || isUnreadAnswer(error) || isProgrammingError(error)
  return true
}

/** The first thing a schema could not accept, in a line: where, and why. Never the value. */
function unreadAnswerSummary(error: Error): string {
  const issues = (error as Error & { issues?: unknown }).issues
  if (!Array.isArray(issues) || issues.length === 0) return 'ZodError'
  const first = issues[0] as { path?: unknown; message?: unknown }
  const path = Array.isArray(first.path) && first.path.length > 0 ? first.path.join('.') : '(the answer itself)'
  const more = issues.length > 1 ? ` (and ${issues.length - 1} more)` : ''
  return `ZodError: ${path}: ${typeof first.message === 'string' ? first.message : 'not as expected'}${more}`
}

/**
 * An error as two texts: what it calls itself and said, and where it came
 * from. A database error gives its code and its message and nothing else
 * — its `details` are where a refused row's values are written out.
 */
export function describeError(error: unknown, componentStack?: string | null): { message: string; stack: string | null } {
  let message: string
  let stack: string | null = null
  if (error instanceof Error) {
    const said = error.message.split('\n')[0].trim()
    message = isUnreadAnswer(error) ? unreadAnswerSummary(error) : said ? `${error.name}: ${said}` : error.name
    stack = error.stack ?? null
  } else if (typeof error === 'string') {
    message = error.trim()
  } else if (error && typeof error === 'object') {
    const code = codeOf(error)
    const said = saidBy(error).split('\n')[0].trim()
    message = [code, said].filter(Boolean).join(': ') || 'An error with nothing to say for itself'
  } else {
    message = String(error)
  }
  if (componentStack?.trim()) stack = `${stack ?? ''}\n— in —${componentStack}`.trim()
  return { message: message.slice(0, MESSAGE_MAX), stack: stack ? stack.slice(0, STACK_MAX) : null }
}

/**
 * The page it happened on: the path, never what follows it (a reset
 * link's token rides there), and never a ticket's code, which is the key
 * to the ticket. The database cuts it the same way; this is so the secret
 * does not leave the device at all.
 */
export function scrubPage(path: string): string {
  return path.split(/[?#]/)[0].replace(/^\/ticket\/[^/]+/, '/ticket/…').slice(0, 200)
}

/** The device, as far as a browser will say: what it calls itself and the size of its window. */
function deviceLine(): string | null {
  try {
    const size = `${window.innerWidth}×${window.innerHeight}`
    return `${navigator.userAgent} · ${size}`.slice(0, DEVICE_MAX)
  } catch {
    return null
  }
}

/** One page load reports this many different things and then holds its tongue: a loop guard. */
export const REPORTS_PER_LOAD = 12
/** The same thing again on the same page waits this long before it is sent again. */
export const SAME_AGAIN_MS = 5 * 60_000

interface Sent {
  at: number
  reference: Promise<string | null>
}
const sent = new Map<string, Sent>()

/** For the tests: forget what this page load has reported. */
export function forgetReports(): void {
  sent.clear()
}

/**
 * Report a failure, if it is worth it. Answers its reference — eight
 * characters somebody can read out — or null when nothing was kept.
 * Never rejects.
 */
export function reportError(
  source: ErrorSource,
  error: unknown,
  extra: { componentStack?: string | null; filename?: string | null; now?: number } = {},
): Promise<string | null> {
  try {
    if (!isSupabaseConfigured || !worthReporting(source, error, extra.filename)) return Promise.resolve(null)
    // Without a connection there is nobody to tell, and the failure is most likely the connection's.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve(null)

    const { message, stack } = describeError(error, extra.componentStack)
    if (!message) return Promise.resolve(null)
    const page = typeof window === 'undefined' ? null : scrubPage(window.location.pathname)
    const now = extra.now ?? Date.now()

    const key = `${page ?? ''}\n${message}`
    const before = sent.get(key)
    if (before && now - before.at < SAME_AGAIN_MS) return before.reference
    if (!before && sent.size >= REPORTS_PER_LOAD) return Promise.resolve(null)

    const reference = Promise.resolve(
      supabase.rpc('report_client_error', {
        p_source: source,
        p_message: message,
        p_stack: stack,
        p_page: page,
        p_build: ownBuildId(),
        p_device: deviceLine(),
        p_installed: isStandalone(),
      }),
    )
      .then(({ data, error: refused }) => (!refused && typeof data === 'string' && data ? data : null))
      .catch(() => null)
    sent.set(key, { at: now, reference })
    return reference
  } catch {
    return Promise.resolve(null)
  }
}

/**
 * Listen for what nothing else catches: an error thrown outside React (a
 * timer, an event handler) and a promise nobody was waiting on. Called
 * once, before the app is drawn.
 */
export function installErrorReporting(target: Pick<Window, 'addEventListener'> | null = typeof window === 'undefined' ? null : window): void {
  if (!target) return
  target.addEventListener('error', (event) => {
    const e = event as ErrorEvent
    // An image or a script that would not load arrives here too, with no error: not this.
    if (!e.error && !e.message) return
    void reportError('window', e.error ?? e.message, { filename: e.filename })
  })
  target.addEventListener('unhandledrejection', (event) => {
    void reportError('promise', (event as PromiseRejectionEvent).reason)
  })
}
