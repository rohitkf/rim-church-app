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
 * build it is, whether the database answered and how long it took.
 */

/** How long the database is given before it counts as not answering. */
export const DATABASE_DEADLINE_MS = 8000

/**
 * Ask the database. Never throws: every way of failing is an answer.
 * @param {{ url: string, key: string }} supabase
 * @param {typeof fetch} [get]
 * @param {() => number} [clock]
 * @returns {Promise<{ ok: boolean, ms: number | null, said: string }>}
 */
export async function askDatabase(supabase, get = fetch, clock = Date.now) {
  if (!supabase.url || !supabase.key) return { ok: false, ms: null, said: 'This deployment has not been told where its database is.' }
  const began = clock()
  try {
    const res = await get(`${supabase.url}/rest/v1/rpc/health`, {
      method: 'POST',
      headers: { apikey: supabase.key, Authorization: `Bearer ${supabase.key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(DATABASE_DEADLINE_MS),
    })
    const ms = clock() - began
    if (!res.ok) return { ok: false, ms, said: `The database's API answered ${res.status}.` }
    const body = await res.json().catch(() => null)
    if (!body || body.ok !== true) return { ok: false, ms, said: 'The database answered, but not with a yes.' }
    return { ok: true, ms, said: 'Answering.' }
  } catch (error) {
    const timedOut = error && typeof error === 'object' && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return {
      ok: false,
      ms: clock() - began,
      said: timedOut ? `The database did not answer within ${DATABASE_DEADLINE_MS / 1000} seconds.` : 'The database could not be reached.',
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
