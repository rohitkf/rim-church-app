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
  // A wallet a browser carries (Brave, MetaMask, Trust and the like) writes its own script into
  // every page and trips over itself there: "window.ethereum.selectedAddress = undefined", from
  // "global code" at the page's own address, as if the page had said it (19 November 2026, the
  // one error App Health had ever been sent). This app has no wallet and touches none of these.
  if (/\bwindow\.(?:ethereum|solana|tronWeb|web3|phantom|trustwallet)\b|\bethereum\.(?:selectedAddress|request|isMetaMask)\b/i.test(said)) return true
  const where = `${filename ?? ''}\n${error instanceof Error ? (error.stack ?? '') : ''}`
  return /(?:chrome|moz|safari-web)-extension:\/\/|webkit-masked-url:\/\//i.test(where)
}

/*
 * A session that has lapsed.
 *
 * The database keeps its rule helpers (is_admin, may, can_open_page, …)
 * from callers who are not signed in — on purpose: the Data API refuses
 * them by name. So when somebody's session runs out with the app still
 * open, the reads the page goes on making are answered "permission denied
 * for function is_admin" (or "for table profiles") rather than with no rows. Nothing is exposed and
 * nothing is broken: they sign in again. But each one arrived in App
 * Health as an error on a device, with nobody's name on it, and read as
 * the app asking for something it should not (15 November 2026).
 *
 * That is only true of somebody who was signed in — on this page load, or
 * on this device when the page loaded — and no longer is. A signed-in
 * person refused a function or a table, or a visitor on a public page refused one,
 * is still the app's mistake and still news.
 */
/**
 * Whether this device was holding a sign-in when the page loaded. The
 * sign-in library keeps it under `sb-<project>-auth-token` and removes it
 * when it finds the session dead, so it is read once, here, before that
 * can happen: an app opened on a session that died overnight was signed
 * in as far as anybody using it knows.
 */
/**
 * Whether this device holds a sign-in at this moment: yes, no, or null
 * when the storage will not say (a private window that refuses it).
 */
function holdsASignIn(): boolean | null {
  try {
    if (typeof localStorage === 'undefined') return null
    for (let i = 0; i < localStorage.length; i += 1) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? '')) return true
    }
    return false
  } catch {
    // Storage refused: nothing is held that we can know of.
    return null
  }
}

const heldASignInAtLoad = (): boolean => holdsASignIn() === true

let hadSession = heldASignInAtLoad()
let hasSession = false

/** Told by AuthContext whenever the session is read or changes. */
export function noteSession(signedIn: boolean): void {
  hasSession = signedIn
  if (signedIn) hadSession = true
}

/** For the tests: as a page that has just loaded, holding whatever sign-in the device has. */
export function forgetSession(): void {
  hadSession = heldASignInAtLoad()
  hasSession = false
}

/**
 * "permission denied for function …" or "… for table …": a rule helper or
 * a table kept from whoever is not signed in. Tables as well as functions:
 * the eight a dead session left in App Health on 16 November 2026 were
 * five functions and three tables (profiles, role_permissions,
 * app_notices), all from the one page load.
 */
const isRefusedByName = (error: unknown) =>
  codeOf(error) === '42501' && /^permission denied for (?:function|table|view)\b/i.test(saidBy(error).trim())

/**
 * A read refused only because the person's session ran out under the page.
 *
 * "No longer signed in" is asked two ways. What the app has been told
 * (`hasSession`) can be behind: a tab left open overnight, or one whose
 * sign-in was ended from another tab, goes on reading before the news
 * reaches it — and the two refusals App Health was sent on 20 November
 * 2026 (`my_clock_in_today`, `is_admin`, the same instant, nobody's name
 * on them) came from exactly such a tab. The device's own storage is not
 * behind: the sign-in library sends a read without a sign-in only when
 * the storage holds none, and every tab shares it. So a device that holds
 * no sign-in *now* has lapsed, whatever the app has heard. Storage that
 * will not answer settles nothing, and what the app was told stands.
 */
export function isLapsedSessionRefusal(source: ErrorSource, error: unknown): boolean {
  if (source !== 'query' || !hadSession || !isRefusedByName(error)) return false
  return !hasSession || holdsASignIn() === false
}

/**
 * Whether a failure is worth telling the church about.
 *
 * Never: no connection, a page a release behind (it reloads itself), an
 * account removed or turned away at the door, a row that is not there,
 * something that is not this app's, a read refused because the session
 * ran out under the page.
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
  if (isLapsedSessionRefusal(source, error)) return false
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
  // Something the page's content policy refused (vercel.json): a script
  // from elsewhere, or one typed into the page. Either the policy is
  // missing something the app needs, or something is in the page that
  // should not be; both are worth a line, and neither is seen otherwise.
  target.addEventListener('securitypolicyviolation', (event) => {
    const v = event as SecurityPolicyViolationEvent
    if (!worthALine(v.effectiveDirective || v.violatedDirective, v.blockedURI, v.sourceFile, typeof location === 'undefined' ? '' : location.origin)) return
    void reportError('window', new Error(blockedLine(v.effectiveDirective || v.violatedDirective, v.blockedURI)), { filename: v.sourceFile })
  })
}

/**
 * Whether something the policy refused is worth telling the church.
 *
 * Not a browser extension writing into the page: that trips the policy
 * too, and is nobody's to fix. And not the app's own bundle asking, once
 * as it loads, whether it may make a function as it runs: the library
 * that reads the database's answers (zod) tries, is refused, and carries
 * on the plain way. It asks while the bundle is still loading, before any
 * setting of the app's could tell it not to, so the one refusal is
 * expected. The same attempt from anywhere else (a script that got into
 * the page) is exactly what this is for.
 */
export function worthALine(directive: string, blocked: string, source: string | null | undefined, origin: string): boolean {
  if (/^(chrome|moz|safari-web)-extension/.test(source || '') || /^(chrome|moz|safari-web)-extension/.test(blocked || '')) return false
  const ours = !!origin && (source || '').startsWith(`${origin}/assets/`)
  if (blocked === 'eval' && directive.startsWith('script-src') && ours) return false
  return true
}

/** "Blocked by the content policy: script-src https://elsewhere.example". The address only, never what followed the "?". */
export function blockedLine(directive: string, blocked: string): string {
  return `Blocked by the content policy: ${directive} ${(blocked || 'inline').split('?')[0].slice(0, 200)}`
}
