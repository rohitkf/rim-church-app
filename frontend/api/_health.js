/*
 * Whether the database is answering, asked from outside it.
 *
 * A database that is down cannot say so, and neither can an app that
 * cannot reach it. So the question is put by something that is neither:
 * this function runs on Vercel, asks the database's public API one cheap
 * thing (`health()`, 0284 — a yes means the API, its gateway and the
 * database behind it are all up), and says what it heard. Anything may
 * read the answer: .github/workflows/uptime.yml does, on a timer, and
 * tells the Owner when it is not a yes; an uptime service the church
 * signs up to later can be pointed at the same address.
 *
 * It says nothing that is not already public — that the site is up, which
 * build it is, whether the database answered, how long it took, and which
 * migration the database has reached (the files are in the repository).
 * CI reads that last number before a release may merge (ci.yml,
 * `database`): an app must not go out ahead of its database.
 */

/** How long the database is given before it counts as not answering. */
export const DATABASE_DEADLINE_MS = 8000

/**
 * Ask the database. Never throws: every way of failing is an answer.
 * @param {{ url: string, key: string }} supabase
 * @param {typeof fetch} [get]
 * @param {() => number} [clock]
 * @returns {Promise<{ ok: boolean, ms: number | null, said: string, schema: number | null }>}
 */
export async function askDatabase(supabase, get = fetch, clock = Date.now) {
  if (!supabase.url || !supabase.key) return { ok: false, ms: null, said: 'This deployment has not been told where its database is.', schema: null }
  const began = clock()
  try {
    const res = await get(`${supabase.url}/rest/v1/rpc/health`, {
      method: 'POST',
      headers: { apikey: supabase.key, Authorization: `Bearer ${supabase.key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(DATABASE_DEADLINE_MS),
    })
    const ms = clock() - began
    if (!res.ok) return { ok: false, ms, said: `The database's API answered ${res.status}.`, schema: null }
    const body = await res.json().catch(() => null)
    if (!body || body.ok !== true) return { ok: false, ms, said: 'The database answered, but not with a yes.', schema: null }
    // Which migration it has reached (0285), for the check that a release is not ahead of it. A database from before that says nothing.
    const schema = Number.isInteger(body.schema) && body.schema >= 0 ? body.schema : null
    return { ok: true, ms, said: 'Answering.', schema }
  } catch (error) {
    const timedOut = error && typeof error === 'object' && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      ms: clock() - began,
      said: timedOut ? `The database did not answer within ${DATABASE_DEADLINE_MS / 1000} seconds.` : 'The database could not be reached.',
      schema: null,
    }
  }
}

/** This deployment's build, as the service worker carries it: the commit's first twelve characters. */
export function buildOf(env = process.env) {
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? ''
  return /^[0-9a-f]{12,}$/i.test(sha) ? sha.slice(0, 12) : null
}

/**
 * The whole answer, and the status it goes out with: 200 when the
 * database answered, 503 when it did not — so a check that only looks at
 * the status gets the right idea.
 */
export function healthAnswer(database, build, at = new Date()) {
  return {
    status: database.ok ? 200 : 503,
    body: { ok: database.ok, app: { build }, database, at: at.toISOString() },
  }
}

/**
 * The database's ledger of its migrations (0285): number, name, checksum,
 * when. Null when it could not be read. Public, like the files it
 * describes; read weekly by .github/workflows/database-drift.yml and held
 * against the repository by scripts/migration-ledger.mjs.
 * @param {{ url: string, key: string }} supabase
 * @param {typeof fetch} [get]
 * @returns {Promise<Array<{ version: number, name: string, checksum: string | null, applied_at: string | null }> | null>}
 */
export async function readLedger(supabase, get = fetch) {
  if (!supabase.url || !supabase.key) return null
  try {
    const res = await get(`${supabase.url}/rest/v1/rpc/schema_ledger`, {
      method: 'POST',
      headers: { apikey: supabase.key, Authorization: `Bearer ${supabase.key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(DATABASE_DEADLINE_MS),
    })
    if (!res.ok) return null
    const rows = await res.json().catch(() => null)
    if (!Array.isArray(rows)) return null
    return rows
      .filter((r) => r && Number.isInteger(r.version) && typeof r.name === 'string')
      .map((r) => ({ version: r.version, name: r.name, checksum: typeof r.checksum === 'string' ? r.checksum : null, applied_at: typeof r.applied_at === 'string' ? r.applied_at : null }))
  } catch {
    return null
  }
}
