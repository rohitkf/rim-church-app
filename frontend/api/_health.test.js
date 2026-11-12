import { afterEach, describe, expect, it, vi } from 'vitest'
import { DATABASE_DEADLINE_MS, askDatabase, buildOf, healthAnswer } from './_health.js'
import { GET as health } from './health.js'
import migration from '../../supabase/migrations/0284_the_app_says_when_something_broke.sql?raw'

/*
 * /api/health: whether the database is answering, asked from outside it.
 * Every way the asking can go is an answer, and none of them is an error
 * of this function's own — a health check that throws says nothing.
 */

const supabase = { url: 'https://db.example', key: 'public-key' }
const answering = (body, init = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200, ...init }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('asking the database', () => {
  it('asks its public API the one cheap question, with the public key', async () => {
    const get = answering({ ok: true, at: '2026-11-12T09:00:00Z' })
    await askDatabase(supabase, get)
    const [address, init] = get.mock.calls[0]
    expect(address).toBe('https://db.example/rest/v1/rpc/health')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('public-key')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('asks for a function the database has, open to a visitor', () => {
    expect(migration).toMatch(/create or replace function public\.health\(\)/)
    expect(migration).toMatch(/grant execute on function public\.health\(\) to anon, authenticated/)
  })

  it('says yes, and how long it took', async () => {
    const times = [1000, 1042]
    expect(await askDatabase(supabase, answering({ ok: true }), () => times.shift())).toEqual({ ok: true, ms: 42, said: 'Answering.' })
  })

  it('says no when the API refuses', async () => {
    const said = await askDatabase(supabase, answering({ message: 'no' }, { status: 503 }))
    expect(said).toMatchObject({ ok: false, said: "The database's API answered 503." })
  })

  it('says no when the answer is not a yes', async () => {
    expect(await askDatabase(supabase, answering({ ok: false }))).toMatchObject({ ok: false, said: 'The database answered, but not with a yes.' })
    expect(await askDatabase(supabase, vi.fn(async () => new Response('<html>a proxy’s page</html>', { status: 200 })))).toMatchObject({ ok: false })
  })

  it('says no when it does not answer in time', async () => {
    const hung = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    expect(await askDatabase(supabase, hung)).toMatchObject({ ok: false, said: `The database did not answer within ${DATABASE_DEADLINE_MS / 1000} seconds.` })
  })

  it('says no when it cannot be reached at all', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await askDatabase(supabase, down)).toMatchObject({ ok: false, said: 'The database could not be reached.' })
  })

  it('says no, without asking, when the deployment was never told where the database is', async () => {
    const get = vi.fn()
    expect(await askDatabase({ url: '', key: '' }, get)).toMatchObject({ ok: false, ms: null })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('the build', () => {
  it('is the commit’s first twelve characters, as the service worker carries it', () => {
    expect(buildOf({ VERCEL_GIT_COMMIT_SHA: '46269dac8f27aa11bb22cc33dd44ee55ff667788' })).toBe('46269dac8f27')
  })

  it('is not known anywhere but a deployment', () => {
    expect(buildOf({})).toBeNull()
    expect(buildOf({ VERCEL_GIT_COMMIT_SHA: 'not a commit' })).toBeNull()
  })
})

describe('the answer', () => {
  const at = new Date('2026-11-12T09:00:00Z')

  it('goes out as 200 when the database answered', () => {
    expect(healthAnswer({ ok: true, ms: 40, said: 'Answering.' }, 'abcdef123456', at)).toEqual({
      status: 200,
      body: { ok: true, app: { build: 'abcdef123456' }, database: { ok: true, ms: 40, said: 'Answering.' }, at: '2026-11-12T09:00:00.000Z' },
    })
  })

  it('goes out as 503 when it did not, so a check that only reads the status is right', () => {
    expect(healthAnswer({ ok: false, ms: 8000, said: 'no' }, null, at).status).toBe(503)
  })
})

describe('/api/health', () => {
  it('answers 200 and is never cached', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.example/')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '46269dac8f27aa11bb22cc33dd44ee55ff667788')
    vi.stubGlobal('fetch', answering({ ok: true }))
    const res = await health()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toMatchObject({ ok: true, app: { build: '46269dac8f27' }, database: { ok: true, said: 'Answering.' } })
    expect(fetch.mock.calls[0][0]).toBe('https://db.example/rest/v1/rpc/health')
  })

  it('answers 503 when the database is down, and still answers', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.example')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const res = await health()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ ok: false, database: { ok: false, said: 'The database could not be reached.' } })
  })
})
