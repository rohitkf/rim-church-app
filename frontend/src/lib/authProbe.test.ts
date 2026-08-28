import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { probeAuthServer, reachabilityAdvice } from './authProbe'

// The tests carry no build-time environment; the probe needs one to have
// somewhere to ask.
beforeEach(() => vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('probeAuthServer', () => {
  it('asks with no headers at all, so nothing preflights it', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ status: 200 } as Response))
    vi.stubGlobal('fetch', fetchMock)

    expect(await probeAuthServer()).toBe('reachable')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/auth\/v1\/health$/)
    expect(init.headers).toBeUndefined()
    expect(init.method).toBe('GET')
  })

  it('counts any answer as proof the packets arrive, refusals included', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ status: 401 } as Response))
    expect(await probeAuthServer()).toBe('reachable')
  })

  it('reports unreachable when the request cannot complete', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')))
    expect(await probeAuthServer()).toBe('unreachable')
  })
})

describe('reachabilityAdvice', () => {
  it('points at the network when the server answers but sign-in does not', () => {
    expect(reachabilityAdvice('reachable')).toMatch(/extension|VPN|network/i)
  })

  it('points at the connection when nothing gets through', () => {
    expect(reachabilityAdvice('unreachable')).toMatch(/can’t be reached/i)
  })

  it('says nothing when it has nothing to say', () => {
    expect(reachabilityAdvice('unknown')).toBeNull()
  })
})
