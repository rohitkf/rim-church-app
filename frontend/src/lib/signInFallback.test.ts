import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signInViaProxy } from './signInFallback'
import { currentRoute } from './supabaseRoute'

const setSession = vi.hoisted(() =>
  vi.fn<() => Promise<{ error: { message: string } | null }>>(() => Promise.resolve({ error: null })),
)
vi.mock('./supabaseClient', () => ({ supabase: { auth: { setSession } } }))

beforeEach(() => {
  localStorage.clear()
  setSession.mockClear()
  setSession.mockResolvedValue({ error: null })
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('signing in over the same-origin route', () => {
  it('asks this origin, not the API host, and hands the tokens to the client', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r' }),
      } as unknown as Response),
    )
    vi.stubGlobal('fetch', fetchMock)

    expect(await signInViaProxy('r@r.org', 'pw')).toEqual({ ok: true })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/sb/auth/v1/token?grant_type=password')
    expect(init.method).toBe('POST')
    expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' })
    // Everything after this should take the road that just worked.
    expect(currentRoute()).toBe('proxy')
  })

  it('passes on a refusal as the real reason, and keeps the working road', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ msg: 'Invalid login credentials' }),
      } as unknown as Response),
    )

    expect(await signInViaProxy('r@r.org', 'wrong')).toEqual({
      ok: false,
      message: 'Invalid login credentials',
    })
    expect(currentRoute()).toBe('proxy')
  })

  it('reports nothing and changes nothing when this road fails too', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))

    expect(await signInViaProxy('r@r.org', 'pw')).toEqual({ ok: false })
    expect(currentRoute()).toBe('direct')
  })

  it('puts the route back if the client rejects the tokens', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r' }),
      } as unknown as Response),
    )
    setSession.mockResolvedValue({ error: { message: 'Invalid token' } })

    expect(await signInViaProxy('r@r.org', 'pw')).toEqual({ ok: false, message: 'Invalid token' })
    expect(currentRoute()).toBe('direct')
  })
})
