import { downloadFile } from './downloadFile'
import { readableHtml, type Lookups, type ReadableData } from './myDataReadable'
import { supabase } from './supabaseClient'
import { formatServiceDay } from './sunday'

/**
 * Your own data, in your own hands (0334).
 *
 * Until November 2026 a copy of what the app held about somebody was
 * something to ask the Owner for, and so was leaving. Both are things the
 * person can now do themselves, from Settings › Your account. The
 * database does the work: `my_data()` gathers every table whose rows are
 * deleted with an account, and `delete_my_account()` is the same removal
 * the Owner does from People.
 */

/** Everything held about the person asking, as the database gave it. */
export async function fetchMyData(): Promise<unknown> {
  const { data, error } = await supabase.rpc('my_data')
  if (error) throw error
  return data
}

/** `my-data-2026-11-26.json`: dated, so a second copy does not look like the first. */
export function myDataFileName(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `my-data-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}.json`
}

/** How much came back, for the line that says the copy was made. */
export function countMyData(data: unknown): { tables: number; rows: number } {
  const tables = data && typeof data === 'object' ? (data as { tables?: unknown }).tables : null
  if (!tables || typeof tables !== 'object') return { tables: 0, rows: 0 }
  const lists = Object.values(tables as Record<string, unknown>).filter(Array.isArray)
  return { tables: lists.length, rows: lists.reduce((sum, rows) => sum + rows.length, 0) }
}

/** Save the database's own answer, every column as it is stored: for whoever wants all of it. */
export function saveMyData(data: unknown, now = new Date()): void {
  const text = JSON.stringify(data, null, 2)
  downloadFile(new TextEncoder().encode(text), myDataFileName(now), 'application/json')
}

/** `my-data-2026-11-26.html`: the copy as a document (lib/myDataReadable). */
export function myDataDocumentName(now: Date): string {
  return myDataFileName(now).replace(/\.json$/, '.html')
}

/**
 * What the ids in the answer mean: the names of teams, services, roles,
 * parts of a service and people, so the document can say "Media" where
 * the row says a thirty-six character id.
 *
 * Each is asked for separately and a refusal or a failure gives nothing
 * of that kind: the document then leaves that line out, which is better
 * than no document.
 */
export async function fetchMyDataLookups(me: string | null): Promise<Lookups> {
  const rows = async (ask: PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => {
    try {
      const { data } = await ask
      return Array.isArray(data) ? (data as Record<string, unknown>[]) : []
    } catch {
      return []
    }
  }
  const [teams, services, roles, people, sessions] = await Promise.all([
    rows(supabase.from('departments').select('id, name')),
    rows(supabase.from('services').select('id, date, service_type')),
    rows(supabase.from('department_roles').select('id, name')),
    rows(supabase.from('profiles').select('id, first_name, last_name')),
    rows(supabase.from('service_sessions').select('id, session_name, service_id')),
  ])
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const service = new Map(services.map((s) => [text(s.id), `${text(s.service_type)}, ${formatServiceDay(text(s.date))}`]))
  return {
    me,
    team: new Map(teams.map((t) => [text(t.id), text(t.name)])),
    service,
    role: new Map(roles.map((r) => [text(r.id), text(r.name)])),
    person: new Map(people.map((p) => [text(p.id), `${text(p.first_name)} ${text(p.last_name)}`.trim()]).filter(([, name]) => name) as [string, string][]),
    session: new Map(
      sessions.map((x) => [text(x.id), `${text(x.session_name)}${service.has(text(x.service_id)) ? ` (${service.get(text(x.service_id))})` : ''}`]),
    ),
  }
}

/** Save the copy as a document a person can open, read, print and keep. */
export function saveMyDataDocument(doc: ReadableData, who: string, now = new Date()): void {
  downloadFile(new TextEncoder().encode(readableHtml(doc, who)), myDataDocumentName(now), 'text/html')
}

/** Whether what was typed is this account's own email address: the word that closes it. */
export function isOwnEmail(typed: string, email: string | null | undefined): boolean {
  return !!email && typed.trim().toLowerCase() === email.toLowerCase()
}

const CLOSED_KEY = 'rim-closed-own-account'
/** How long the sign-in page goes on saying so: long enough to be read, not so long it greets the next person. */
const CLOSED_NOTE_MS = 2 * 60_000

function noteClosing(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(CLOSED_KEY, String(Date.now()))
    else sessionStorage.removeItem(CLOSED_KEY)
  } catch {
    // Storage refused: the sign-in page says the account is no longer active, which is also true.
  }
}

/**
 * Remove the account of the person signed in, and everything that is
 * theirs. The database checks the address again and refuses the Owner.
 *
 * A note is left for the sign-in page before the database is asked, and
 * taken back if it refuses. Before, not after: the moment the account is
 * gone, every other request in flight is refused as "account removed",
 * and that sends the browser to the sign-in page with a different story
 * (lib/accountRemoved) before this function has returned. Seen in a real
 * browser, November 2026: the page said "no longer active, speak to an
 * Admin" to somebody who had just removed their own account on purpose.
 */
export async function deleteMyAccount(email: string): Promise<void> {
  noteClosing(true)
  const { error } = await supabase.rpc('delete_my_account', { p_email: email })
  if (error) {
    noteClosing(false)
    throw error
  }
}

/**
 * What is left to do in the browser once the account is gone: forget the
 * session it was holding, and start again at the sign-in page, which reads
 * the note (closedJustNow) and says what happened. A hard load, so nothing read as that
 * person survives.
 */
export async function leaveAfterClosing(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // The server no longer knows this session; the local copy is cleared either way.
  }
  if (typeof window !== 'undefined') window.location.assign('/login')
}

/**
 * Whether this browser has just closed its own account.
 *
 * Not read once and forgotten: the browser can arrive at the sign-in page
 * twice in a second (once sent by the refusal, once by this file), and the
 * second arrival must say the same as the first. The note lapses by
 * itself, and goes when its tab does.
 */
export function closedJustNow(now: number = Date.now()): boolean {
  try {
    const at = Number(sessionStorage.getItem(CLOSED_KEY))
    return at > 0 && now - at < CLOSED_NOTE_MS
  } catch {
    return false
  }
}
